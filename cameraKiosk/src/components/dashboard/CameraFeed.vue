<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  deviceId: {
    type: String,
    required: true
  },
  imageSrc: {
    type: String,
    default: ''
  },
  boxes: {
    type: Array,
    default: () => []
  },
  aiEnabled: {
    type: Boolean,
    default: true
  },
  detectionMode: {
    type: String,
    default: 'AI'
  },
  showFpsMeter: {
    type: Boolean,
    default: true
  }
})

const streamImg = ref(null)
const overlayCanvas = ref(null)
const containerRef = ref(null)

// FPS Counter State
const fps = ref(0)
let frameTimes = []
let fpsInterval = null

// Zoom and Pan State
const isFullscreen = ref(false)
const scale = ref(1)
const panX = ref(0)
const panY = ref(0)
const isDragging = ref(false)
const lastClientX = ref(0)
const lastClientY = ref(0)

// Touch Gestures State
let initialTouchDistance = 0
let initialScale = 1
let lastTap = 0

const toggleFullscreen = async () => {
  if (!containerRef.value) return
  
  if (!document.fullscreenElement) {
    try {
      if (containerRef.value.requestFullscreen) {
        await containerRef.value.requestFullscreen()
      } else if (containerRef.value.webkitRequestFullscreen) {
        await containerRef.value.webkitRequestFullscreen()
      } else if (containerRef.value.msRequestFullscreen) {
        await containerRef.value.msRequestFullscreen()
      }
      isFullscreen.value = true
    } catch (e) {
      console.warn("Fullscreen request failed", e)
    }
  } else {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen()
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen()
      }
      isFullscreen.value = false
    } catch (e) {}
  }
}

const handleFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
}

const resetZoom = () => {
  scale.value = 1
  panX.value = 0
  panY.value = 0
}

const handleWheel = (e) => {
  e.preventDefault()
  const zoomDirection = e.deltaY > 0 ? -1 : 1
  const newScale = scale.value + (zoomDirection * 0.2)
  scale.value = Math.max(1, Math.min(newScale, 5))
  if (scale.value === 1) resetZoom()
}

const handleDoubleClick = () => {
  if (scale.value > 1) {
    resetZoom()
  } else {
    scale.value = 2.5
  }
}

const handleDragStart = (e) => {
  if (scale.value <= 1) return
  isDragging.value = true
  lastClientX.value = e.clientX
  lastClientY.value = e.clientY
}

const handleDragMove = (e) => {
  if (!isDragging.value) return
  const deltaX = e.clientX - lastClientX.value
  const deltaY = e.clientY - lastClientY.value
  panX.value += deltaX
  panY.value += deltaY
  lastClientX.value = e.clientX
  lastClientY.value = e.clientY
}

const handleDragEnd = () => {
  isDragging.value = false
}

const getTouchDistance = (touches) => {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  )
}

const handleTouchStart = (e) => {
  if (e.touches.length === 2) {
    initialTouchDistance = getTouchDistance(e.touches)
    initialScale = scale.value
  } else if (e.touches.length === 1) {
    const now = Date.now()
    if (now - lastTap < 300) {
      handleDoubleClick()
      e.preventDefault()
      return
    }
    lastTap = now
    
    if (scale.value > 1) {
      isDragging.value = true
      lastClientX.value = e.touches[0].clientX
      lastClientY.value = e.touches[0].clientY
    }
  }
}

const handleTouchMove = (e) => {
  if (e.touches.length === 2) {
    e.preventDefault() // prevent page scroll
    const currentDistance = getTouchDistance(e.touches)
    const newScale = initialScale * (currentDistance / initialTouchDistance)
    scale.value = Math.max(1, Math.min(newScale, 5))
  } else if (e.touches.length === 1 && isDragging.value) {
    e.preventDefault() // prevent page scroll while panning
    const deltaX = e.touches[0].clientX - lastClientX.value
    const deltaY = e.touches[0].clientY - lastClientY.value
    panX.value += deltaX
    panY.value += deltaY
    lastClientX.value = e.touches[0].clientX
    lastClientY.value = e.touches[0].clientY
  }
}

const handleTouchEnd = () => {
  if (scale.value === 1) resetZoom()
  isDragging.value = false
}

const drawBoxes = () => {
  const canvas = overlayCanvas.value
  const img = streamImg.value
  if (!canvas || !img) return

  const ctx = canvas.getContext('2d')
  
  canvas.width = img.clientWidth
  canvas.height = img.clientHeight

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!props.aiEnabled || !props.boxes || props.boxes.length === 0) return

  const getDisplayImageRect = () => {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const clientWidth = img.clientWidth;
    const clientHeight = img.clientHeight;

    if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) {
      return { left: 0, top: 0, width: clientWidth, height: clientHeight };
    }

    const imageRatio = naturalWidth / naturalHeight;
    const elementRatio = clientWidth / clientHeight;

    let width, height, left, top;

    if (elementRatio > imageRatio) {
      height = clientHeight;
      width = height * imageRatio;
      top = 0;
      left = (clientWidth - width) / 2;
    } else {
      width = clientWidth;
      height = width / imageRatio;
      left = 0;
      top = (clientHeight - height) / 2;
    }

    return { left, top, width, height };
  }

  const rect = getDisplayImageRect();

  props.boxes.forEach(box => {
    const [x1_norm, y1_norm, x2_norm, y2_norm] = box.posisi
    const conf = box.confidence

    const bx1 = rect.left + x1_norm * rect.width
    const by1 = rect.top + y1_norm * rect.height
    const bw = (x2_norm - x1_norm) * rect.width
    const bh = (y2_norm - y1_norm) * rect.height

    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 2
    ctx.strokeRect(bx1, by1, bw, bh)

    const label = props.detectionMode === 'Pixel'
      ? 'Motion'
      : `Person ${Math.round(conf * 100)}%`
    ctx.font = 'bold 11px Arial'
    const textMetrics = ctx.measureText(label)
    const textHeight = 14
    
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(bx1, by1 - textHeight, textMetrics.width + 6, textHeight)
    
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, bx1 + 3, by1 - 4)
  })
}

watch(() => props.boxes, drawBoxes, { deep: true })
watch(() => props.imageSrc, () => {
  frameTimes.push(performance.now())
  setTimeout(drawBoxes, 30)
})

const handleResize = () => {
  drawBoxes()
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  setTimeout(drawBoxes, 50)

  fpsInterval = setInterval(() => {
    const now = performance.now()
    frameTimes = frameTimes.filter(t => now - t < 1000)
    fps.value = frameTimes.length
  }, 500)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  if (fpsInterval) {
    clearInterval(fpsInterval)
  }
})
</script>

<template>
  <div ref="containerRef" 
       class="camera-feed-container w-100 h-100 position-relative d-flex align-items-center justify-content-center overflow-hidden bg-black"
       @wheel="handleWheel"
       @mousedown="handleDragStart"
       @mousemove="handleDragMove"
       @mouseup="handleDragEnd"
       @mouseleave="handleDragEnd"
       @touchstart="handleTouchStart"
       @touchmove="handleTouchMove"
       @touchend="handleTouchEnd"
       @dblclick="handleDoubleClick">
       
    <div class="zoom-wrapper w-100 h-100 d-flex align-items-center justify-content-center position-relative"
         :style="{ 
           transform: `translate(${panX}px, ${panY}px) scale(${scale})`, 
           transformOrigin: 'center', 
           transition: isDragging ? 'none' : 'transform 0.1s ease-out',
           cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
         }">
      <img v-if="imageSrc"
           :src="imageSrc" 
           class="w-100 h-100 object-fit-contain" 
           ref="streamImg"
           alt="Camera Feed"
           style="pointer-events: none;" />
      <div v-else class="text-center z-2 text-slate-400 p-4">
        <div class="spinner-border text-info mb-2" role="status" style="width: 2rem; height: 2rem;">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="small font-monospace mb-0 text-uppercase" style="letter-spacing: 2px; font-size: 0.7rem;">
          {{ $t('stream.waiting') }}
        </p>
      </div>
      <canvas ref="overlayCanvas" 
              class="position-absolute pointer-events-none"
              style="pointer-events: none; z-index: 10;">
      </canvas>
    </div>

    <!-- Controls Overlay -->
    <div class="camera-controls position-absolute bottom-0 end-0 p-3 d-flex gap-2 z-3 transition-opacity">
      <button v-if="scale > 1" @click.stop="resetZoom" class="btn btn-sm btn-dark text-white shadow-sm border border-secondary border-opacity-50" title="Reset Zoom">
        <i class="bi bi-aspect-ratio"></i>
      </button>
      <button @click.stop="toggleFullscreen" class="btn btn-sm btn-dark text-white shadow-sm border border-secondary border-opacity-50" title="Toggle Fullscreen">
        <i :class="isFullscreen ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen'"></i>
      </button>
    </div>

    <!-- FPS Meter Badge Overlay -->
    <div v-if="imageSrc && showFpsMeter" class="fps-meter">
      <span class="fps-dot"></span>
      <span>{{ fps }} FPS</span>
    </div>
  </div>
</template>

<style scoped>
.object-fit-contain { object-fit: contain; }

.camera-feed-container {
  touch-action: none; /* Crucial for custom touch gestures like pinch-to-zoom */
}

/* Controls fade in on hover on desktop, always visible or semi-transparent on mobile */
.camera-controls {
  opacity: 0.3;
}
.camera-feed-container:hover .camera-controls {
  opacity: 1;
}

.fps-meter {
  position: absolute;
  bottom: 1rem;
  left: 1rem; /* Moved to left to avoid clashing with fullscreen button */
  z-index: 20;
  background-color: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(51, 65, 85, 0.8);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.75rem;
  color: #10b981;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: none;
}

.fps-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: pulse 1.5s infinite alternate;
}

@keyframes pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.2); opacity: 1; }
}
</style>
