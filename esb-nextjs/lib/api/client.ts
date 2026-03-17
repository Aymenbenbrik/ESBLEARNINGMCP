import axios from 'axios';

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  export const apiClient = axios.create({
    baseURL: API_URL,
    withCredentials: true, // Important: sends cookies with requests
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Response interceptor for handling errors
  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      // Handle 401 errors (missing/expired token)
      if (error.response?.status === 401) {
        console.warn('[API Client] 401 Unauthorized - Token missing or expired');

        // Clear cookies
        document.cookie = 'access_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'refresh_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Only redirect if not on login/public pages
        const publicPaths = ['/login', '/register', '/forgot-password'];
        if (typeof window !== 'undefined' && !publicPaths.some(path => window.location.pathname.includes(path))) {
          window.location.href = '/login?error=session_expired';
        }
      }

      // Handle 422 errors (invalid JWT) globally
      if (error.response?.status === 422) {
        console.warn('[API Client] 422 Unprocessable Entity - Invalid JWT token');

        // Clear invalid JWT cookies
        document.cookie = 'access_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        document.cookie = 'refresh_token_cookie=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Redirect to login if not already there
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login?error=session_invalid';
        }
      }

      return Promise.reject(error);
    }
  );

  export default apiClient;