import styles from './registerform.module.css';
import SendButton from '../SendButton';
import { useForm } from 'react-hook-form';
import { useMutation } from 'react-query';
import { useNavigate } from 'react-router';
import { registerUser } from '../../../lib/utils/apiUser';
import { setUserSession } from '../../../lib/utils/userSession';
import { errorToast } from '../../../lib/toastify/toast';

const RegisterForm = () => {
  const navigate = useNavigate();

  const registerMutation = useMutation(['registerUser'], registerUser, {
    onSuccess: (data) => {
      setUserSession(data);
      navigate('/');
    },
    onError: (e) => {
      if (e.status === 400) {
        errorToast('Solicitud incorrecta');
      } else {
        errorToast('Interno del servidor');
      }
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = (data) => {
    registerMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={styles.registerForm}>
      <div className={styles.field}>
        <input
          id='userName'
          type='text'
          placeholder='Nombre de Usuario'
          {...register('userName', {
            required: 'El nombre es obligatorio',
            minLength: { value: 2, message: 'Mínimo 2 caracteres' },
            maxLength: { value: 20, message: 'Máximo 20 caracteres' },
          })}
        />
        {errors.userName && <p className={styles.error}>{errors.userName.message}</p>}
      </div>

      <div className={styles.field}>
        <input
          id='email'
          type='email'
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
          id='password'
          type='password'
          placeholder='Contraseña'
          {...register('password', {
            required: 'La contraseña es obligatoria',
            pattern: {
              value:
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/,
              message:
                'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial',
            },
          })}
        />
        {errors.password && <p className={styles.error}>{errors.password.message}</p>}
      </div>

      <div className={styles.field}>
        <label>
          <input type='checkbox' {...register('policy', { required: 'Debes aceptar las políticas' })} />
          <span>Acepto las políticas</span>
        </label>
        {errors.policy && <p className={styles.error}>{errors.policy.message}</p>}
      </div>

      <SendButton disabled={registerMutation.isLoading} text='Registrarse' />
    </form>
  );
};

export default RegisterForm;
