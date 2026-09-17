/**
 * The subset of the user record that JwtStrategy puts on `request.user`.
 * Deliberately excludes the password hash so it can never leak through a
 * controller that returns the current user straight back to the client.
 */
export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
}
