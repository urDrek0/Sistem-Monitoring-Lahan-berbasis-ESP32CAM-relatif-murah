<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  events: { type: Array, required: true },
  initialIndex: { type: Number, default: 0 },
  backendUrl: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const currentIndex = ref(props.initialIndex)
const scale = ref(1)

watch(() => props.initialIndex, (newVal) => {
  currentIndex.value = newVal
  scale.value = 1
})

watch(currentIndex, () => {
  scale.value = 1
})

const currentEvent = computed(() => props.events[currentIndex.value])

const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url.replace('gateway.local', window.location.hostname);
  const base = props.backendUrl || `http://${window.location.hostname}:3000`;
  return `${base}${url}`;
}

const nextImage = () => {
  if (currentIndex.value < props.events.length - 1) {
    currentIndex.value++
  }
}

const prevImage = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

const closeViewer = () => {
  emit('close')
}

const handleWheel = (e) => {
  // Hanya proses zoom jika menggunakan mouse scroll / touchpad scroll
  e.preventDefault()
  
  const zoomSensitivity = 0.1
  if (e.deltaY < 0) {
    // Scroll atas (Zoom In)
    scale.value = Math.min(scale.value + zoomSensitivity, 5)
  } else {
    // Scroll bawah (Zoom Out)
    scale.value = Math.max(scale.value - zoomSensitivity, 0.5)
  }
}

// Keyboard navigation
const handleKeydown = (e) => {
  if (e.key === 'ArrowRight') nextImage()
  if (e.key === 'ArrowLeft') prevImage()
  if (e.key === 'Escape') closeViewer()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.body.style.overflow = 'hidden' // prevent body scrolling
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = '' // restore scrolling
})

const formatEventTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  if (!timestamp.includes('T') && timestamp.includes(':')) return timestamp;
  
  const date = new Date(timestamp);
  if (isNaN(date)) return timestamp;

  const dateStr = date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  
  return `${dateStr} - ${timeStr}`;
}
</script>

<template>
  <div class="image-viewer-modal position-fixed top-0 start-0 w-100 h-100 bg-black z-index-modal d-flex flex-column" @click.self="closeViewer">
    <!-- Header -->
    <div class="viewer-header p-3 d-flex justify-content-between align-items-start text-white">
      <div v-if="currentEvent" class="metadata small lh-sm">
        <div class="mb-1 text-secondary opacity-75" style="font-size: 0.7rem;">Date</div>
        <div class="mb-2">{{ formatEventTime(currentEvent.timestamp) }}</div>
        
        <div class="mb-1 text-secondary opacity-75" style="font-size: 0.7rem;">IP Camera / Location</div>
        <div class="mb-2">{{ currentEvent.location }}</div>
        
        <div class="mb-1 text-secondary opacity-75" style="font-size: 0.7rem;">Trigger Type</div>
        <div>
          {{ currentEvent.trigger }}
          <span v-if="currentEvent.humanPresence" class="badge bg-danger ms-2" style="font-size: 0.6rem;">HUMAN</span>
        </div>
      </div>
      <button @click="closeViewer" class="btn btn-link text-white p-0 text-decoration-none fs-3 lh-1">
        <i class="bi bi-x"></i>
      </button>
    </div>

    <!-- Image Container -->
    <div class="flex-grow-1 position-relative d-flex align-items-center justify-content-center overflow-auto" @click.self="closeViewer">
      <button 
        v-if="currentIndex > 0" 
        @click.stop="prevImage" 
        class="nav-btn position-absolute start-0 ms-2 btn btn-dark bg-opacity-50 text-white rounded-circle d-flex align-items-center justify-content-center"
      >
        <i class="bi bi-chevron-left fs-4"></i>
      </button>

      <div class="image-wrapper text-center w-100 h-100 d-flex align-items-center justify-content-center" @click.self="closeViewer" @wheel.prevent="handleWheel">
        <img v-if="currentEvent?.imageUrl" :src="getImageUrl(currentEvent.imageUrl)" class="viewer-img" alt="Event Image" :style="{ transform: `scale(${scale})`, transformOrigin: 'center center' }" />
        <div v-else class="text-secondary">No Image Available</div>
      </div>

      <button 
        v-if="currentIndex < events.length - 1" 
        @click.stop="nextImage" 
        class="nav-btn position-absolute end-0 me-2 btn btn-dark bg-opacity-50 text-white rounded-circle d-flex align-items-center justify-content-center"
      >
        <i class="bi bi-chevron-right fs-4"></i>
      </button>
    </div>
    
    <!-- Footer Counter -->
    <div class="text-center text-white py-3 small opacity-75">
       {{ currentIndex + 1 }} / {{ events.length }}
    </div>
  </div>
</template>

<style scoped>
.z-index-modal {
  z-index: 9999; /* Ensure it's above everything */
}

.image-viewer-modal {
  backdrop-filter: blur(5px);
  background-color: rgba(0, 0, 0, 0.9) !important;
}

.viewer-header {
  background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);
}

.image-wrapper {
  overflow: auto; /* allows native pinch-to-zoom scrolling if image exceeds bounds */
}

.viewer-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.2s;
}

.nav-btn {
  width: 50px;
  height: 50px;
  z-index: 1060;
  border: none;
}
.nav-btn:hover {
  background-color: rgba(255,255,255,0.2) !important;
}
</style>
