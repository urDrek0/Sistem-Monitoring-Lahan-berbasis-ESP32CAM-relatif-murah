<script setup>
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()

function toggleLanguage() {
  locale.value = locale.value === 'id' ? 'en' : 'id'
  localStorage.setItem('kiosk_locale', locale.value)
}

defineProps({
  currentTime: {
    type: String,
    required: true
  },
  wsStatus: {
    type: String,
    required: true
  },
  aiConnected: {
    type: Boolean,
    required: true
  },
  aiDetecting: {
    type: Boolean,
    required: true
  },
  aiEnabled: {
    type: Boolean,
    default: true
  },
  // Tambahan prop untuk menerima data storage dari backend
  storageData: {
    type: Object,
    default: null
  },
  isForceMobile: {
    type: Boolean,
    default: false
  },
  windowWidth: {
    type: Number,
    required: true
  },
  viewMode: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['toggle-force-mobile', 'openSystemConfig', 'setViewMode', 'logout'])
</script>

<template>
  <nav class="navbar bg-slate-800 px-3 py-1 py-md-0 border-bottom border-slate-700 z-3 flex-shrink-0" style="min-height: 45px;">
    <div class="container-fluid p-0 d-flex align-items-center justify-content-between flex-wrap" style="row-gap: 6px;">
      <div class="d-flex align-items-center gap-2">
        <a class="navbar-brand fw-bold d-flex align-items-center gap-2 m-0" href="#" style="font-size: 1.1rem;">
          <img src="/magic cam logo.png" alt="Magic Cam Logo" height="24" class="brand-logo" />
          <span v-if="windowWidth >= 510">Magic Cam</span>
        </a>
        <button @click="toggleLanguage" class="btn btn-sm btn-outline-secondary border-slate-700 text-slate-300 px-2 py-1" style="font-size: 0.65rem; border: 1px solid rgba(148, 163, 184, 0.3);">
          {{ locale === 'id' ? '🇮🇩 ID' : '🇬🇧 EN' }}
        </button>
      </div>
      <div class="d-flex align-items-center gap-3 ms-auto">
        
        <div v-if="storageData" class="d-flex flex-column justify-content-center border-end pe-3 me-1 border-slate-700" style="width: 110px;">
          <div class="d-flex justify-content-between mb-1" style="font-size: 0.6rem; font-weight: bold;">
            <span class="text-secondary">{{ $t('nav.storage') }}</span>
            <span :class="storageData.percentage >= 90 ? 'text-danger animate-pulse' : (storageData.percentage >= 70 ? 'text-warning' : 'text-success')">
              {{ storageData.percentage }}%
            </span>
          </div>
          <div class="progress" style="height: 4px; background-color: #334155; border-radius: 2px;">
            <div class="progress-bar" 
                 :class="storageData.percentage >= 90 ? 'bg-danger' : (storageData.percentage >= 70 ? 'bg-warning' : 'bg-success')" 
                 :style="{ width: storageData.percentage + '%' }" >
            </div>
          </div>
          <div class="text-secondary mt-1 text-center font-monospace" style="font-size: 0.55rem;">
            {{ storageData.usedGb }}GB / {{ storageData.totalGb }}GB
          </div>
        </div>
        <div v-if="windowWidth >= 695" class="d-flex align-items-center gap-2 border-end pe-2 pe-sm-3 border-slate-700">
          <div class="fw-bold font-monospace lh-1" style="font-size: 0.85rem;">{{ currentTime }}</div>
          <div class="text-secondary" style="font-size: 0.65rem;">
            {{ new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}
          </div>
        </div>
        
        <!-- Force Mobile View Toggle (Only shown on Desktop > 1000px) -->
        <button 
          v-if="windowWidth > 1000" 
          @click="$emit('toggle-force-mobile')" 
          :class="['btn btn-sm text-uppercase fw-bold font-monospace px-2 py-1 border-slate-700', isForceMobile ? 'btn-info text-slate-900' : 'btn-outline-secondary text-slate-300']"
          style="font-size: 0.65rem; border: 1px solid rgba(148, 163, 184, 0.3);"
        >
          <i :class="isForceMobile ? 'bi bi-phone-fill me-1' : 'bi bi-pc-display me-1'"></i>
          {{ isForceMobile ? $t('nav.normalView') : $t('nav.mobileView') }}
        </button>
        
        <div class="d-flex align-items-center text-secondary" style="font-size: 1rem; gap: 0.5rem;">
          <!-- WebSocket Status Icon -->
          <i :class="wsStatus === 'Online' ? 'bi-broadcast text-success' : 'bi-broadcast-pin text-danger'"
             :title="'WebSocket: ' + (wsStatus === 'Online' ? $t('nav.wsOnline') : $t('nav.wsOffline'))">
          </i>
          
          <!-- AI Status Icon -->
          <i v-if="!aiEnabled" class="bi bi-eye-slash-fill text-slate-400" :title="'AI: ' + $t('nav.aiDisabled')"></i>
          <i v-else-if="!aiConnected" class="bi bi-cloud-slash text-danger" :title="'AI: ' + $t('nav.aiOffline')"></i>
          <i v-else-if="aiDetecting" class="bi bi-eye-fill text-warning animate-pulse" :title="'AI: ' + $t('nav.aiDetecting')"></i>
          <i v-else class="bi bi-eye text-success" :title="'AI: ' + $t('nav.aiScanning')"></i>

          <!-- Separator between status and display mode -->
          <div class="vr bg-slate-600 opacity-40 mx-1" style="height: 1rem; align-self: center; width: 1.5px;"></div>

          <!-- Display Mode Toggle Button -->
          <button @click="emit('setViewMode', viewMode === 'single' ? 'multiple' : 'single')" 
                  class="btn btn-sm btn-link p-1 hover-info d-flex align-items-center justify-content-center"
                  :title="viewMode === 'single' ? $t('stream.multipleView') : $t('stream.singleView')"
                  style="min-width: 32px; min-height: 32px;">
            <i :class="viewMode === 'single' ? 'bi bi-grid-3x3-gap-fill text-slate-400' : 'bi bi-camera-fill text-slate-400'" style="font-size: 1rem; transition: color 0.2s ease, transform 0.2s ease; display: inline-block;"></i>
          </button>

          <!-- Separator between display mode and settings -->
          <div class="vr bg-slate-600 opacity-40 mx-1" style="height: 1rem; align-self: center; width: 1.5px;"></div>

          <!-- System Settings Button -->
          <button @click="emit('openSystemConfig')" 
                  class="btn btn-sm btn-link p-1 hover-info d-flex align-items-center justify-content-center" 
                  title="System Settings"
                  style="min-width: 32px; min-height: 32px;">
            <i class="bi bi-gear-fill text-slate-400" style="font-size: 1rem; transition: color 0.2s ease, transform 0.2s ease; display: inline-block;"></i>
          </button>

          <!-- Separator between settings and logout -->
          <div class="vr bg-slate-600 opacity-40 mx-1" style="height: 1rem; align-self: center; width: 1.5px;"></div>

          <!-- Logout Button -->
          <button @click="emit('logout')" 
                  class="btn btn-sm btn-link p-1 text-danger hover-danger d-flex align-items-center justify-content-center" 
                  title="Logout"
                  style="min-width: 32px; min-height: 32px;">
            <i class="bi bi-box-arrow-right" style="font-size: 1rem; transition: transform 0.2s ease; display: inline-block;"></i>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.font-monospace { font-family: 'JetBrains Mono', ui-monospace, monospace !important; }

.brand-logo { filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.5)); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@media (max-width: 480px) {
  .container-fluid { padding-left: 0.4rem !important; padding-right: 0.4rem !important; }
  .gap-3 { gap: 0.5rem !important; }
}
</style>