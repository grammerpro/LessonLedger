import { LoginForm } from '@/components/login-form';
import { config } from '@/server/config';
export default function Login() {
  return <LoginForm sample={config.demo} />;
}
