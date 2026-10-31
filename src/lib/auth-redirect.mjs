const NATIVE_CALLBACK_URI = 'com.thaikanya.icaretele://auth/callback';

export function getOAuthRedirectUri({ native, origin }) {
  return native ? NATIVE_CALLBACK_URI : origin;
}
