import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import KioskDashboard from '../components/KioskDashboard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/',
      name: 'kiosk',
      component: KioskDashboard,
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const getBackendUrl = () => {
    if (window.location.port === '5173') {
      return `http://${window.location.hostname}:3000`;
    }
    return `${window.location.protocol}//${window.location.host}/ws_api`;
  };
  const backendUrl = getBackendUrl();

  if (to.meta.requiresAuth) {
    try {
      const res = await fetch(`${backendUrl}/api/verify`, {
        credentials: 'include'
      });
      const data = await res.json();
      
      if (data.success && data.authenticated) {
        next();
      } else {
        next('/login');
      }
    } catch (err) {
      console.error('Auth verification failed:', err);
      next('/login');
    }
  } else {
    // Check if already authenticated when going to login page
    if (to.name === 'login') {
      try {
        const res = await fetch(`${backendUrl}/api/verify`, {
          credentials: 'include'
        });
        const data = await res.json();
        
        if (data.success && data.authenticated) {
          return next('/');
        }
      } catch (err) {
        // ignore error, just proceed to login
      }
    }
    next();
  }
})

export default router
