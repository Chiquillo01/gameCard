import { useCallback, useEffect, useState } from 'react';
import styles from './news.module.css';
import { fetchNews, markNewsSeen, publishNews, updateNews, deleteNews, newsError, NEWS_KINDS, NEWS_SEEN_EVENT } from '../../../../lib/utils/apiNews';
import { useUser } from '../../../../context/userContext';
import { getSocket } from '../../../../lib/socket';
import { successToast, errorToast } from '../../../../lib/toastify/toast';

const kindLabel = (kind) => (NEWS_KINDS.find((k) => k.id === kind) || NEWS_KINDS[0]).label;
const formatDate = (date) => new Date(date).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Admins publish news from here (title, type, text); the same form, filled in, edits one
// already published (`editing` is that notice; `onCancel` closes the edit).
const PublishForm = ({ onPublished, editing = null, onCancel }) => {
  const [title, setTitle] = useState(editing ? editing.title : '');
  const [kind, setKind] = useState(editing ? editing.kind : 'news');
  const [body, setBody] = useState(editing ? editing.body : '');
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      if (editing) {
        await updateNews(editing._id, { title, kind, body });
        successToast('Noticia editada');
      } else {
        await publishNews({ title, kind, body });
        successToast('Noticia publicada');
        setTitle('');
        setBody('');
        setKind('news');
      }
      onPublished();
    } catch (err) {
      errorToast(newsError(err, editing ? 'No se pudo editar' : 'No se pudo publicar'));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.publish} onSubmit={submit}>
      <h3>{editing ? 'Editar la noticia' : 'Publicar una noticia'}</h3>
      <div className={styles.publishRow}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Título' maxLength={120} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {NEWS_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder='Qué ha cambiado, qué llega...' rows={5} maxLength={5000} />
      <div className={styles.formActions}>
        <button type='submit' disabled={sending || !title.trim() || !body.trim()}>
          {editing ? (sending ? 'Guardando...' : 'Guardar cambios') : sending ? 'Publicando...' : 'Publicar'}
        </button>
        {editing && (
          <button type='button' className={styles.cancel} onClick={onCancel} disabled={sending}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
};

// News, balance changes, events and maintenance notices, newest first. Opening the page marks
// everything as read (the bell clears); what was new stays highlighted while you're here.
const NewsPage = () => {
  const { data: user } = useUser();
  const [news, setNews] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchNews();
      setNews(data.news);
      if (data.unread) {
        await markNewsSeen();
        window.dispatchEvent(new Event(NEWS_SEEN_EVENT)); // clears the bell
      }
    } catch (e) {
      errorToast(newsError(e, 'No se pudieron cargar las noticias'));
      setNews([]);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('news:new', load);
    socket.on('news:deleted', load);
    socket.on('news:updated', load);
    return () => {
      socket.off('news:new', load);
      socket.off('news:deleted', load);
      socket.off('news:updated', load);
    };
  }, [load]);

  const remove = async (item) => {
    try {
      await deleteNews(item._id);
      successToast('Noticia eliminada');
      load();
    } catch (e) {
      errorToast(newsError(e, 'No se pudo eliminar'));
    }
  };

  const shown = (news || []).filter((n) => filter === 'all' || n.kind === filter);

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Noticias</h2>

      {user?.admin && <PublishForm onPublished={load} />}

      <div className={styles.filters}>
        {[{ id: 'all', label: 'Todas' }, ...NEWS_KINDS].map((k) => (
          <button key={k.id} className={`${styles.filter} ${filter === k.id ? styles.filterActive : ''}`} onClick={() => setFilter(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {news === null ? (
        <p className={styles.empty}>Cargando...</p>
      ) : shown.length ? (
        <ul className={styles.list}>
          {shown.map((item) => (
            <li key={item._id} className={`${styles.item} ${item.unread ? styles.unread : ''}`}>
              <div className={styles.itemHeader}>
                <span className={`${styles.kind} ${styles[`kind_${item.kind}`] || ''}`}>{kindLabel(item.kind)}</span>
                {item.unread && <span className={styles.newTag}>Nueva</span>}
                <span className={styles.date}>
                  {formatDate(item.createdAt)}
                  {item.editedAt && <span className={styles.edited}> · editado el {formatDate(item.editedAt)}</span>}
                </span>
              </div>
              {editingId === item._id ? (
                <PublishForm
                  editing={item}
                  onCancel={() => setEditingId(null)}
                  onPublished={() => {
                    setEditingId(null);
                    load();
                  }}
                />
              ) : (
                <>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  <p className={styles.body}>{item.body}</p>
                </>
              )}
              {user?.admin && editingId !== item._id && (
                <div className={styles.adminActions}>
                  <button className={styles.edit} onClick={() => setEditingId(item._id)}>
                    Editar
                  </button>
                  <button className={styles.delete} onClick={() => remove(item)}>
                    Eliminar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>No hay noticias todavía.</p>
      )}
    </div>
  );
};

export default NewsPage;
