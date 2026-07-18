<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  mac: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'save'])

const servoConfig = ref({
  defaultAngle: 90,
  leftPirAngle: 45,
  middlePirAngle: 90,
  rightPirAngle: 135,
  returnToDefaultDuration: 15,
  sweepMode: 'disabled'
})

const fetchServoConfig = () => {
  if (!props.mac || props.mac === 'Unknown MAC') return
  window.dispatchEvent(new CustomEvent('request_servo_config', { 
    detail: { mac: props.mac } 
  }));
}

const handleConfigReceived = (event) => {
  const { mac, config } = event.detail;
  if (mac === props.mac && config) {
    servoConfig.value = {
      defaultAngle: config.defaultAngle ?? 90,
      leftPirAngle: config.leftPirAngle ?? 45,
      middlePirAngle: config.middlePirAngle ?? 90,
      rightPirAngle: config.rightPirAngle ?? 135,
      returnToDefaultDuration: config.returnToDefaultDuration ?? 15,
      sweepMode: config.sweepMode ?? 'disabled'
    };
    console.log('Loaded saved servo config via WS for:', mac);
  }
};

onMounted(() => {
  window.addEventListener('servo_config_received', handleConfigReceived);
  fetchServoConfig();
})

onUnmounted(() => {
  window.removeEventListener('servo_config_received', handleConfigReceived);
})

const saveConfig = () => {
  emit('save', servoConfig.value)
}

// Multi-Thumb Slider Logic
const activeThumb = ref(null)
const multiSliderTrack = ref(null)

const handleThumbStart = (thumb) => {
  activeThumb.value = thumb
  window.addEventListener('mousemove', handleThumbMove)
  window.addEventListener('mouseup', handleThumbEnd)
  window.addEventListener('touchmove', handleThumbMove, { passive: false })
  window.addEventListener('touchend', handleThumbEnd)
}

const handleThumbMove = (e) => {
  if (!activeThumb.value || !multiSliderTrack.value) return
  
  e.preventDefault()
  const rect = multiSliderTrack.value.getBoundingClientRect()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const offsetX = clientX - rect.left
  const percentage = Math.max(0, Math.min(100, (offsetX / rect.width) * 100))
  const value = Math.round((percentage / 100) * 180)

  // Non-overlapping constraints (min 20 degrees apart)
  const MIN_DIST = 20;
  if (activeThumb.value === 'left') {
    servoConfig.value.leftPirAngle = Math.min(value, servoConfig.value.middlePirAngle - MIN_DIST)
  } else if (activeThumb.value === 'middle') {
    servoConfig.value.middlePirAngle = Math.max(servoConfig.value.leftPirAngle + MIN_DIST, Math.min(value, servoConfig.value.rightPirAngle - MIN_DIST))
  } else if (activeThumb.value === 'right') {
    servoConfig.value.rightPirAngle = Math.max(value, servoConfig.value.middlePirAngle + MIN_DIST)
  }
}

const handleThumbEnd = () => {
  activeThumb.value = null
  window.removeEventListener('mousemove', handleThumbMove)
  window.removeEventListener('mouseup', handleThumbEnd)
  window.removeEventListener('touchmove', handleThumbMove)
  window.removeEventListener('touchend', handleThumbEnd)
}
</script>

<template>
  <div class="modal-overlay d-flex align-items-center justify-content-center p-3">
    <div class="modal-content-custom bg-slate-900 border border-slate-700 rounded-3 shadow-lg p-4" style="max-width: 450px; width: 100%;">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h6 class="text-white mb-0 text-uppercase fw-bold" style="letter-spacing: 1px;">
          <i class="bi bi-gear-wide-connected me-2 text-info"></i>{{ t('servo.title') }}
        </h6>
        <button @click="emit('close')" class="btn-close btn-close-white shadow-none"></button>
      </div>

      <div class="modal-body-custom pe-1">
        <!-- Default Angle -->
        <div class="mb-4 p-3 bg-slate-800 rounded-2 border border-slate-700">
          <div class="d-flex justify-content-between align-items-center mb-2">
          <label class="text-slate-300 small fw-bold">{{ t('servo.defaultAngle') }}</label>
          <span class="text-info font-monospace small">{{ servoConfig.defaultAngle }}°</span>
        </div>
        <input type="range" class="form-range custom-slider" min="0" max="180" v-model.number="servoConfig.defaultAngle">
      </div>

      <!-- Return to Default Duration -->
      <div class="mb-4 p-3 bg-slate-800 rounded-2 border border-slate-700">
        <label class="text-slate-300 small fw-bold mb-2 text-uppercase d-block">{{ t('servo.autoReturn') }}</label>
        <span class="text-slate-500 d-block mb-3" style="font-size: 0.7rem;">{{ t('servo.autoReturnDesc') }}</span>
        
        <div class="d-flex gap-2 justify-content-between flex-wrap">
          <button 
            type="button"
            @click="servoConfig.returnToDefaultDuration = 0" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.returnToDefaultDuration === 0 ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem; min-width: 65px;">
            {{ t('servo.disabled') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.returnToDefaultDuration = 3" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.returnToDefaultDuration === 3 ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            3{{ t('servo.sec') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.returnToDefaultDuration = 5" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.returnToDefaultDuration === 5 ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            5{{ t('servo.sec') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.returnToDefaultDuration = 15" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.returnToDefaultDuration === 15 ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            15{{ t('servo.sec') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.returnToDefaultDuration = 30" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.returnToDefaultDuration === 30 ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            30{{ t('servo.sec') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.returnToDefaultDuration = 60" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.returnToDefaultDuration === 60 ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            60{{ t('servo.sec') }}
          </button>
        </div>
      </div>

      <!-- PIR Mapping (Multi-Thumb Slider) -->
      <div class="mb-4 p-3 bg-slate-800 rounded-2 border border-slate-700">
        <label class="text-slate-300 small fw-bold mb-4 d-block">{{ t('servo.pirMapping') }}</label>
        
        <div class="position-relative py-4 px-1">
          <!-- Labels -->
          <div class="d-flex justify-content-between position-absolute w-100 top-0 start-0 text-slate-500" style="font-size: 1rem; margin-top: -5px;">
            <span :style="{ color: '#ef4444', fontWeight: 'bold', textShadow: '0 0 4px rgba(239, 68, 68, 0.4)' }">{{ t('servo.left') }}: {{ servoConfig.leftPirAngle }}°</span>
            <span :style="{ color: '#22c55e', fontWeight: 'bold', textShadow: '0 0 4px rgba(34, 197, 94, 0.4)' }">{{ t('servo.mid') }}: {{ servoConfig.middlePirAngle }}°</span>
            <span :style="{ color: '#3b82f6', fontWeight: 'bold', textShadow: '0 0 4px rgba(59, 130, 246, 0.4)' }">{{ t('servo.right') }}: {{ servoConfig.rightPirAngle }}°</span>
          </div>

          <!-- Track -->
          <div ref="multiSliderTrack" class="multi-range-track position-relative bg-slate-700" style="height: 12px; border-radius: 6px;">
            <!-- Colored Segments -->
            <div class="position-absolute h-100" :style="{ left: 0, width: (servoConfig.leftPirAngle/180*100) + '%', background: '#ef4444', opacity: 0.3, borderRadius: '6px 0 0 6px' }"></div>
            <div class="position-absolute h-100" :style="{ left: (servoConfig.leftPirAngle/180*100) + '%', width: ((servoConfig.middlePirAngle - servoConfig.leftPirAngle)/180*100) + '%', background: '#22c55e', opacity: 0.3 }"></div>
            <div class="position-absolute h-100" :style="{ left: (servoConfig.middlePirAngle/180*100) + '%', width: ((servoConfig.rightPirAngle - servoConfig.middlePirAngle)/180*100) + '%', background: '#3b82f6', opacity: 0.3 }"></div>

            <!-- Thumbs -->
            <!-- Left Thumb -->
            <div class="thumb left" 
                 @mousedown="handleThumbStart('left')" 
                 @touchstart="handleThumbStart('left')"
                 :style="{ left: (servoConfig.leftPirAngle/180*100) + '%' }">
            </div>
            <!-- Middle Thumb -->
            <div class="thumb middle" 
                 @mousedown="handleThumbStart('middle')" 
                 @touchstart="handleThumbStart('middle')"
                 :style="{ left: (servoConfig.middlePirAngle/180*100) + '%' }">
            </div>
            <!-- Right Thumb -->
            <div class="thumb right" 
                 @mousedown="handleThumbStart('right')" 
                 @touchstart="handleThumbStart('right')"
                 :style="{ left: (servoConfig.rightPirAngle/180*100) + '%' }">
            </div>
          </div>

          <!-- Degree Ticks -->
          <div class="d-flex justify-content-between mt-3 px-1 text-slate-600" style="font-size: 0.55rem;">
            <span>0°</span>
            <span>45°</span>
            <span>90°</span>
            <span>135°</span>
            <span>180°</span>
          </div>
          
          <!-- FOV Visualizer -->
          <div class="position-relative mt-4 d-flex justify-content-center" style="height: 140px; overflow: hidden; border-bottom: 2px solid #334155; border-radius: 4px; background: rgba(0,0,0,0.2);">
            <div class="position-absolute top-0 start-0 p-1 text-slate-500" style="font-size: 0.55rem; font-weight: bold; z-index: 5;">{{ t('servo.fovVisualizer') }}</div>
            
            <!-- Origin Point (Servo Center) -->
            <div class="position-absolute bottom-0" style="width: 12px; height: 12px; background: #cbd5e1; border-radius: 50%; z-index: 20; transform: translateY(50%); box-shadow: 0 0 10px #ffffff;"></div>
            
            <!-- Reference Arch/Grid -->
            <div class="position-absolute bottom-0" style="width: 280px; height: 140px; border: 2px dashed #334155; border-bottom: none; border-radius: 140px 140px 0 0; opacity: 0.5;"></div>
            
            <!-- Left Cone -->
            <div class="position-absolute bottom-0"
                 :style="{
                   left: '50%',
                   width: '206px',
                   height: '150px',
                   background: 'linear-gradient(to top, rgba(239, 68, 68, 0.8), rgba(239, 68, 68, 0.05))',
                   clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                   mixBlendMode: 'screen',
                   transformOrigin: 'bottom center',
                   transform: `translateX(-50%) rotate(${servoConfig.leftPirAngle - 90}deg)`
                 }">
            </div>

            <!-- Middle Cone -->
            <div class="position-absolute bottom-0"
                 :style="{
                   left: '50%',
                   width: '206px',
                   height: '150px',
                   background: 'linear-gradient(to top, rgba(34, 197, 94, 0.8), rgba(34, 197, 94, 0.05))',
                   clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                   mixBlendMode: 'screen',
                   transformOrigin: 'bottom center',
                   transform: `translateX(-50%) rotate(${servoConfig.middlePirAngle - 90}deg)`
                 }">
            </div>

            <!-- Right Cone -->
            <div class="position-absolute bottom-0"
                 :style="{
                   left: '50%',
                   width: '206px',
                   height: '150px',
                   background: 'linear-gradient(to top, rgba(59, 130, 246, 0.8), rgba(59, 130, 246, 0.05))',
                   clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                   mixBlendMode: 'screen',
                   transformOrigin: 'bottom center',
                   transform: `translateX(-50%) rotate(${servoConfig.rightPirAngle - 90}deg)`
                 }">
            </div>
          </div>
        </div>
      </div>

      <!-- Servo Sweep Option Selectors -->
      <div class="mb-4 p-3 bg-slate-800 rounded-2 border border-slate-700">
        <label class="text-slate-300 small fw-bold mb-2 text-uppercase d-block">{{ t('servo.servoSweep') }}</label>
        <span class="text-slate-500 d-block mb-3" style="font-size: 0.7rem;">{{ t('servo.sweepDesc') }}</span>
        
        <div class="d-flex gap-2 justify-content-between flex-wrap">
          <button 
            type="button"
            @click="servoConfig.sweepMode = 'disabled'" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.sweepMode === 'disabled' ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem; min-width: 65px;">
            {{ t('servo.disabled') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.sweepMode = 'continuous'" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.sweepMode === 'continuous' ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            {{ t('servo.continuous') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.sweepMode = '15s'" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.sweepMode === '15s' ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            15{{ t('servo.sec') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.sweepMode = '30s'" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.sweepMode === '30s' ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            30{{ t('servo.sec') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.sweepMode = '1m'" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.sweepMode === '1m' ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            1{{ t('servo.min') }}
          </button>
          <button 
            type="button"
            @click="servoConfig.sweepMode = '5m'" 
            :class="['btn flex-grow-1 py-2 fw-bold text-uppercase duration-btn', servoConfig.sweepMode === '5m' ? 'btn-info text-dark shadow-info' : 'btn-outline-secondary text-slate-300']"
            style="font-size: 0.75rem;">
            5{{ t('servo.min') }}
          </button>
        </div>
      </div>
      
      </div>

      <div class="d-flex gap-2 mt-2">
        <button @click="saveConfig" class="btn btn-primary flex-grow-1 py-2 fw-bold text-uppercase" style="font-size: 0.75rem;">
          {{ t('servo.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-monospace { font-family: 'JetBrains Mono', ui-monospace, monospace !important; }

/* High-Visibility Custom Slider */
.custom-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 10px;
  background: #334155;
  border-radius: 5px;
  outline: none;
  margin: 10px 0;
}

.custom-slider::-webkit-slider-runnable-track {
  width: 100%;
  height: 10px;
  background: #334155;
  border-radius: 5px;
  border: none;
}

.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 28px;
  height: 28px;
  background: #3b82f6;
  border: 3px solid #ffffff;
  border-radius: 50%;
  cursor: pointer;
  margin-top: -9px;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
}

.custom-slider::-moz-range-track {
  width: 100%;
  height: 10px;
  background: #334155;
  border-radius: 5px;
}

.custom-slider::-moz-range-thumb {
  width: 28px;
  height: 28px;
  background: #3b82f6;
  border: 3px solid #ffffff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
}

.text-slate-500 { color: #64748b; }

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 2000;
}

.modal-content-custom {
  animation: modalScale 0.2s ease-out;
}

@keyframes modalScale {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.bg-slate-800 { background-color: #1e292b; }
.bg-slate-900 { background-color: #0f172a; }
.text-slate-300 { color: #cbd5e1; }
.text-slate-600 { color: #475569; }

/* Scrollable config body list */
.modal-body-custom {
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
}

.modal-body-custom::-webkit-scrollbar {
  width: 6px;
}
.modal-body-custom::-webkit-scrollbar-track {
  background: transparent;
}
.modal-body-custom::-webkit-scrollbar-thumb {
  background-color: #334155;
  border-radius: 4px;
}
.modal-body-custom::-webkit-scrollbar-thumb:hover {
  background-color: #475569;
}

.multi-range-track {
  touch-action: none;
}

.thumb {
  position: absolute;
  top: 50%;
  width: 28px;
  height: 28px;
  background: #ffffff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 10;
  box-shadow: 0 0 8px rgba(0,0,0,0.5);
  transition: transform 0.1s ease;
}

.thumb:active {
  transform: translate(-50%, -50%) scale(1.1);
}

.thumb.left { border: 4px solid #ef4444; }
.thumb.middle { border: 4px solid #22c55e; }
.thumb.right { border: 4px solid #3b82f6; }

/* Custom Switch & Button Styling */
.custom-switch {
  width: 3.2em;
  height: 1.6em;
  cursor: pointer;
  background-color: #334155;
  border-color: #475569;
}
.custom-switch:focus {
  box-shadow: none;
  border-color: #475569;
}
.custom-switch:checked {
  background-color: #06b6d4;
  border-color: #0891b2;
}
.transition-all {
  transition: opacity 0.2s ease, pointer-events 0.2s ease;
}
.duration-btn {
  transition: all 0.2s ease;
  border-radius: 6px;
}
.shadow-info {
  box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
}
</style>
