<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const password = ref('')
const error = ref('')
const isLoading = ref(false)
const isShaking = ref(false)
const showPassword = ref(false)

const handleLogin = async () => {
  if (!password.value) {
    error.value = 'Password wajib diisi!'
    triggerErrorShake()
    return
  }

  isLoading.value = true
  error.value = ''

  try {
    const getBackendUrl = () => {
      if (window.location.port === '5173') {
        return `http://${window.location.hostname}:3000`;
      }
      return `${window.location.protocol}//${window.location.host}/ws_api`;
    };
    const backendUrl = getBackendUrl();
    
    const response = await fetch(`${backendUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        password: password.value
      })
    })

    const data = await response.json()

    if (response.ok && data.success) {
      router.push('/')
    } else {
      triggerErrorShake(data.message || 'Password yang Anda masukkan salah!')
    }
  } catch (err) {
    console.error('Login request error:', err)
    triggerErrorShake('Tidak dapat terhubung ke server backend.')
  } finally {
    isLoading.value = false
  }
}

const triggerErrorShake = (msg = '') => {
  if (msg) error.value = msg
  isShaking.value = true
  setTimeout(() => {
    isShaking.value = false
  }, 600)
}

const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}
</script>

<template>
  <div class="login-container d-flex align-items-center justify-content-center">
    <div :class="['card', 'bg-slate-800', 'border-slate-700', 'rounded-4', 'shadow-soft', 'p-4', 'p-md-5', { 'shake-animation': isShaking }]" style="width: 100%; max-width: 420px;">
      <div class="text-center mb-4">
        <div class="mb-3">
          <img src="/magic cam logo.png" alt="Magic Cam Logo" style="width: 200px; height: auto; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.4));" />
        </div>
        <h4 class="fw-bold text-slate-50 mb-1">Magic Cam</h4>
        <p class="text-secondary font-monospace" style="font-size: 0.8rem;">SISTEM MONITORING LAHAN</p>
      </div>

      <div v-if="error" class="alert alert-danger border-danger-subtle bg-danger-subtle text-danger-emphasis py-2 px-3 mb-3 rounded-3" style="font-size: 0.85rem;">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        {{ error }}
      </div>

      <form @submit.prevent="handleLogin">
        <div class="mb-4">
          <label for="password" class="form-label text-slate-300 font-monospace small">Kunci Akses (Password)</label>
          <div class="input-group">
            <span class="input-group-text border-slate-700 bg-slate-900 text-secondary">
              <i class="bi bi-key-fill"></i>
            </span>
            <input 
              v-model="password" 
              :type="showPassword ? 'text' : 'password'" 
              class="form-control border-slate-700 bg-slate-900 text-slate-50 shadow-none focus-glow" 
              id="password" 
              placeholder="Masukkan password sistem"
              required 
              autofocus
            />
            <button 
              type="button" 
              @click="togglePasswordVisibility" 
              class="input-group-text border-slate-700 bg-slate-900 text-secondary hover-accent"
              style="cursor: pointer;"
            >
              <i :class="showPassword ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill'"></i>
            </button>
          </div>
        </div>

        <button 
          type="submit" 
          class="btn btn-primary w-100 py-2.5 fw-bold btn-login border-0" 
          :disabled="isLoading"
        >
          <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          <i v-else class="bi bi-box-arrow-in-right me-2"></i>
          {{ isLoading ? 'Memproses...' : 'Masuk ke Sistem' }}
        </button>
      </form>

      <div class="text-center mt-4">
        <span class="text-secondary font-monospace" style="font-size: 0.65rem;">
          Secure Access Mode v3.0
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  width: 100vw;
  background-color: var(--bs-body-bg);
  background-image: 
    radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.05) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(30, 41, 59, 0.8) 0px, transparent 50%);
}

.brand-icon {
  width: 60px;
  height: 60px;
  background-color: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
}

.text-slate-50 {
  color: var(--bs-body-color);
}
.text-slate-300 {
  color: #cbd5e1;
}

.input-group-text {
  border-right: none;
  transition: color 0.15s ease-in-out;
}

.hover-accent:hover {
  color: var(--accent) !important;
}

.form-control {
  border-left: none;
  border-right: none;
}
.form-control::placeholder {
  color: #64748b;
  font-size: 0.9rem;
}

.focus-glow:focus {
  border-color: var(--accent) !important;
}

/* Specific styling override for inputs focus borders */
.input-group:focus-within .input-group-text,
.input-group:focus-within .form-control {
  border-color: var(--accent) !important;
}

.btn-login {
  background-color: var(--accent);
  transition: all 0.2s ease-in-out;
}
.btn-login:hover {
  background-color: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
.btn-login:active {
  transform: translateY(0);
}
.btn-login:disabled {
  background-color: #1e3a8a;
  color: #93c5fd;
  opacity: 0.7;
}

/* Animations */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}

.shake-animation {
  animation: shake 0.5s ease-in-out;
}
</style>
