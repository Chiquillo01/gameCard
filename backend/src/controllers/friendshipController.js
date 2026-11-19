const mongoose = require('mongoose');
const { Friendship } = require('../data/Schema/friendship');
const { User } = require('../data/Schema/user');
const { Invitation } = require('../data/Schema/invitation');
const { areFriends, makeFriends, removeFriendship } = require('../services/friends');
const { emitToUser } = require('../services/notify');
const { cancelTradesBetween } = require('../services/trades');

// What the client may see of another player.
const PUBLIC_FIELDS = '_id userName profilePicture level';

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// Both sides refetch their friends page when something between them changes.
const notifyChange = (...userIds) => userIds.forEach((id) => emitToUser(id, 'friends:changed'));

// GET /friendship — the player's friends, plus the requests waiting on them and the ones they sent.
const getFriends = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const [friendships, incoming, outgoing] = await Promise.all([
      Friendship.find({ $or: [{ userA: userId }, { userB: userId }] }).populate('userA userB', PUBLIC_FIELDS).lean(),
      Invitation.find({ receiver: userId, status: 'PENDING' }).populate('sender', PUBLIC_FIELDS).sort({ createdAt: -1 }).lean(),
      Invitation.find({ sender: userId, status: 'PENDING' }).populate('receiver', PUBLIC_FIELDS).sort({ createdAt: -1 }).lean(),
    ]);

    const friends = friendships
      .map((f) => (String(f.userA?._id) === String(userId) ? f.userB : f.userA))
      .filter(Boolean) // a deleted account leaves its side of the pair empty
      .sort((a, b) => a.userName.localeCompare(b.userName));

    res.status(200).json({
      friends,
      incoming: incoming.filter((i) => i.sender).map((i) => ({ _id: i._id, user: i.sender, createdAt: i.createdAt })),
      outgoing: outgoing.filter((i) => i.receiver).map((i) => ({ _id: i._id, user: i.receiver, createdAt: i.createdAt })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar los amigos' });
  }
};

// POST /friendship/invitation { friendName } — sends a request by user name. If that player had
// already sent one to you, it's accepted instead (both want it).
const sendInvitation = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const friendName = String(req.body.friendName || '').trim();
    if (!friendName) return res.status(400).json({ error: 'Escribe el nombre del usuario' });

    const [sender, receiver] = await Promise.all([User.findById(userId), User.findOne({ userName: friendName })]);
    if (!sender) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!receiver) return res.status(404).json({ error: 'Ese usuario no existe' });
    if (String(receiver._id) === String(userId)) return res.status(400).json({ error: 'No puedes enviarte una solicitud a ti mismo' });
    if (await areFriends(userId, receiver._id)) return res.status(409).json({ error: `${receiver.userName} ya es tu amigo` });

    const reverse = await Invitation.findOne({ sender: receiver._id, receiver: userId, status: 'PENDING' });
    if (reverse) {
      reverse.status = 'ACCEPTED';
      await reverse.save();
      await makeFriends(userId, receiver._id);
      emitToUser(receiver._id, 'friend:accepted', { userName: sender.userName });
      notifyChange(userId, receiver._id);
      return res.status(200).json({ message: `Ahora eres amigo de ${receiver.userName}`, accepted: true });
    }

    const existing = await Invitation.findOne({ sender: userId, receiver: receiver._id, status: 'PENDING' });
    if (existing) return res.status(409).json({ error: `Ya le enviaste una solicitud a ${receiver.userName}` });

    const invitation = await Invitation.create({ sender: userId, receiver: receiver._id, status: 'PENDING' });
    emitToUser(receiver._id, 'friend:request', { invitationId: invitation._id, userName: sender.userName });
    notifyChange(receiver._id);
    res.status(201).json({ message: 'Solicitud de amistad enviada', invitationId: invitation._id });
  } catch (e) {
    res.status(500).json({ error: 'Error al enviar la solicitud' });
  }
};

// The pending invitation `id` addressed to (or, with `asSender`, sent by) the player, or null.
async function pendingInvitation(id, userId, asSender = false) {
  if (!isId(id)) return null;
  return Invitation.findOne({ _id: id, status: 'PENDING', [asSender ? 'sender' : 'receiver']: userId });
}

// POST /friendship/invitation/:id/accept
const acceptInvitation = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const invitation = await pendingInvitation(req.params.id, userId);
    if (!invitation) return res.status(404).json({ error: 'Solicitud no encontrada' });

    invitation.status = 'ACCEPTED';
    await invitation.save();
    await makeFriends(userId, invitation.sender);

    const me = await User.findById(userId).select('userName').lean();
    emitToUser(invitation.sender, 'friend:accepted', { userName: me && me.userName });
    notifyChange(userId, invitation.sender);
    res.status(200).json({ message: 'Solicitud aceptada' });
  } catch (e) {
    res.status(500).json({ error: 'Error al aceptar la solicitud' });
  }
};

// POST /friendship/invitation/:id/reject
const rejectInvitation = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const invitation = await pendingInvitation(req.params.id, userId);
    if (!invitation) return res.status(404).json({ error: 'Solicitud no encontrada' });

    invitation.status = 'REJECTED';
    await invitation.save();
    notifyChange(userId, invitation.sender);
    res.status(200).json({ message: 'Solicitud rechazada' });
  } catch (e) {
    res.status(500).json({ error: 'Error al rechazar la solicitud' });
  }
};

// DELETE /friendship/invitation/:id — the sender takes back a request nobody has answered yet.
const cancelInvitation = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const invitation = await pendingInvitation(req.params.id, userId, true);
    if (!invitation) return res.status(404).json({ error: 'Solicitud no encontrada' });

    await invitation.deleteOne();
    notifyChange(userId, invitation.receiver);
    res.status(200).json({ message: 'Solicitud cancelada' });
  } catch (e) {
    res.status(500).json({ error: 'Error al cancelar la solicitud' });
  }
};

// DELETE /friendship/:friendId
const removeFriend = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { friendId } = req.params;
    if (!isId(friendId) || !(await removeFriendship(userId, friendId))) {
      return res.status(404).json({ error: 'Ese usuario no es tu amigo' });
    }
    await cancelTradesBetween(userId, friendId); // no swaps left hanging between ex-friends
    notifyChange(userId, friendId);
    emitToUser(userId, 'trades:changed');
    emitToUser(friendId, 'trades:changed');
    res.status(200).json({ message: 'Amigo eliminado' });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar el amigo' });
  }
};

module.exports = {
  getFriends,
  sendInvitation,
  acceptInvitation,
  rejectInvitation,
  cancelInvitation,
  removeFriend,
};
