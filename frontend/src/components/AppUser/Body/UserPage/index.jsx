import '@fontsource/metamorphous';
import styles from './userPage.module.css';
import { useState, useEffect, useMemo } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import { fetchUsers, createUser, deleteUser } from '../../../../lib/utils/apiUser';
import { useUser } from '../../../../context/userContext';
import PageTitle from '../Generic/PageTitle';
import InfoContainer from './InfoContainer';
import UserList from './UserList';
import CreateUser from './CreateUser';
import 'react-toastify/dist/ReactToastify.css';

const UserPage = () => {
  const { data } = useUser();
  const [userArray, setuserArray] = useState([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ userName: '', email: '', password: '', level: '', admin: false });

  const [searchTerm, setSearchTerm] = useState('');

  const [activeFilter, setActiveFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 5;

  useEffect(() => {
    fetchUsersList();
  }, []);

  const fetchUsersList = async () => {
    try {
      const response = await fetchUsers();
      setuserArray(response);
    } catch (e) {
      toast.error('Error al obtener usuarios');
    }
  };

  const openModal = () => setIsModalOpen(true);

  const filteredUsers = useMemo(() => {
    return userArray.filter((user) => {
      const matchesSearch =
        user.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole =
        activeFilter === 'all' ||
        (activeFilter === 'admin' && user.admin === true) ||
        (activeFilter === 'user' && user.admin === false);
      return matchesSearch && matchesRole;
    });
  }, [userArray, searchTerm, activeFilter]);

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleSortChange = ({ field, order }) => {
    const sortedUsers = [...userArray].sort((a, b) => {
      if (order === 'asc') return a[field] > b[field] ? 1 : -1;
      return a[field] < b[field] ? 1 : -1;
    });
    setuserArray(sortedUsers);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: newUser } = await createUser(form, data);
      setuserArray([...userArray, newUser]);
      setIsModalOpen(false);
      setForm({ userName: '', email: '', password: '', level: '', admin: false });
    } catch (error) {
      toast.error('Error al crear el usuario');
    }
  };

  const handleUpdate = (updatedUser) => {
    setuserArray(userArray.map((user) => (user._id === updatedUser._id ? updatedUser : user)));
  };

  const handleDelete = async (id) => {
    try {
      await deleteUser(id, data);
      fetchUsersList();
    } catch (e) {
      toast.error('Error al eliminar usuario');
    }
  };

  return (
    <>
      <div className={styles.bodyUserPageContainer}>
        <PageTitle
          title='Usuarios'
          showAddIcon={true}
          showSercher={true}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          openModal={openModal}
          placeholder='Escribe el nombre del usuario ...'
        />

        <InfoContainer
          userArray={userArray}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          handleSortChange={handleSortChange}
          currentPage={currentPage}
          totalPages={totalPages}
          handlePageChange={handlePageChange}
        />

        <UserList filteredUsers={paginatedUsers} handleUpdate={handleUpdate} handleDelete={handleDelete} />
      </div>

      {isModalOpen && (
        <CreateUser form={form} setForm={setForm} handleSubmit={handleSubmit} onClose={() => setIsModalOpen(false)} />
      )}

      <ToastContainer position='top-right' autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover />
    </>
  );
};

export default UserPage;
