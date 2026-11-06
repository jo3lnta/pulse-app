function pulseAuthError(error) {
  const es = (localStorage.getItem("pulse.language.v1") || "en") === "es";
  const code = error?.code || "";
  if (code === "email_not_confirmed") return es
    ? "Confirma tu correo antes de entrar. Revisa también la carpeta de spam."
    : "Confirm your email before signing in. Check your spam folder too.";
  if (code === "email_address_not_authorized" || code === "over_email_send_rate_limit" || /email rate limit/i.test(error?.message || "")) return es
    ? "El servicio de correo de PULSE no ha podido enviar el mensaje. El administrador debe revisar el proveedor de correo antes de que vuelvas a intentarlo."
    : "PULSE could not send the email. The administrator needs to check the email provider before you retry.";
  if (error?.status === 429 || code === "over_request_rate_limit") return es
    ? "Demasiados intentos. Espera unos minutos y vuelve a intentarlo."
    : "Too many attempts. Wait a few minutes before trying again.";
  if (code === "invalid_credentials") return es
    ? "Correo o contraseña incorrectos. Si aún no tienes cuenta, pulsa Crear una cuenta."
    : "Incorrect email or password. If you do not have an account yet, choose Create an account.";
  if (code === "signup_disabled") return es ? "El registro está desactivado temporalmente." : "Registration is temporarily disabled.";
  return es ? "No se pudo completar la operación. Comprueba tu conexión y vuelve a intentarlo." : "Could not complete the request. Check your connection and try again.";
}
