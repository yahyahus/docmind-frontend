/**
 * FILE: lib/api.js
 * ROLE: Central API client. All backend calls go through here.
 *
 * WHAT THIS FILE DOES:
 * - Creates an axios instance pointed at your FastAPI backend
 * - Automatically attaches JWT token to every request
 * - Handles 401 errors (token expired) by redirecting to login
 *
 * WHAT THIS FILE DOES NOT DO:
 * - Does not contain UI components
 * - Does not manage state
 * - Does not know about pages or routing
 */

import axios from 'axios';
import Cookies from 'js-cookie';

// Create axios instance with base URL from environment variable
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — runs before every API call
// Automatically adds Bearer token if it exists in cookies
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — runs after every API response
// If token expired (401), clear it and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;