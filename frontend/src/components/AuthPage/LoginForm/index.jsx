import styles from './loginform.module.css';
import SendButton from '../SendButton';
import { useForm } from 'react-hook-form';
import { useMutation } from 'react-query';
import { useNavigate } from 'react-router';
import { loginUser } from '../../../lib/utils/apiUser';
import { setUserSession } from '../../../lib/utils/userSession';
import { errorToast } from '../../../lib/toastify/toast';

const LoginForm = () => {
  const navigate = useNavigate();

  const loginMutation = useMutation(['loginUser'], loginUser, {
    onSuccess: (data) => {
      setUserSession(data);
      navigate('/');
    },
    onError: (e) => {
      if (e.status === 400) {
        errorToast('Solicitud incorrecta');
      } else if (e.status === 410) {
        errorToast('Usuario ya Registrado');
      } else {
        errorToast('Error Interno del Servidor');
      }
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = (data) => {
    loginMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={styles.loginForm}>
      <div className={styles.field}>
        <input
          type='email'
          id='email'
          placeholder='Correo electrónico'
          {...register('email', {
            required: 'El correo es obligatorio',
            pattern: {
              value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
              message: 'Formato de correo inválido',
            },
          })}
        />
        {errors.email && <p className={styles.error}>{errors.email.message}</p>}
      </div>

      <div className={styles.field}>
        <input
          type='password'
          id='password'
          placeholder='Contraseña'
          {...register('password', {
            required: 'La contraseña es obligatoria',
            pattern: {
              value:
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/,
              message:
                'Debe tener al menos 8 caracteres, una letra mayúscula, una minúscula, un número y un carácter especial',
            },
          })}
        />
        {errors.password && <p className={styles.error}>{errors.password.message}</p>}
      </div>

      <SendButton disabled={loginMutation.isLoading} text='Iniciar Sesión' />
    </form>
  );
};

export default LoginForm;
