// GreenMove — js/app.js — refined for Round 2
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getRole() {
  return localStorage.getItem('role');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('user_name');
  window.location.href = '/index.html';
}

function showToast(message) {
  const toast = document.getElementById('toast') || createToastElement();
  toast.innerText = message;
  toast.className = 'show';
  setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 4000);
}

function createToastElement() {
  const div = document.createElement('div');
  div.id = 'toast';
  document.body.appendChild(div);
  return div;
}

// Updated apiCall to handle standard { success, data, error } responses
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const json = await res.json();
  
  if (!json.success) {
    throw new Error(json.error || 'API Error');
  }
  return json.data;
}

function checkAuth(allowedRoles) {
  const token = getToken();
  const role = getRole();
  if (!token) {
    window.location.href = '/index.html';
    return;
  }
  if (allowedRoles && !allowedRoles.includes(role)) {
    alert('Unauthorized');
    window.location.href = '/index.html';
  }
  
  const userName = localStorage.getItem('user_name');
  const userGreeting = document.getElementById('user-greeting');
  if (userGreeting && userName) {
    userGreeting.innerText = `Hello, ${userName}!`;
  }
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

window.logout = logout;
window.checkAuth = checkAuth;
window.apiCall = apiCall;
window.showToast = showToast;
window.debounce = debounce;

// ============================================
// PARTICLE CANVAS — Floating green dots
// ============================================
(function initParticles() {
  document.addEventListener('DOMContentLoaded', function() {
    var canvas = document.createElement('canvas');
    canvas.id = 'particle-canvas';
    document.body.prepend(canvas);
    var ctx = canvas.getContext('2d');
    var particles = [];
    var COUNT = 35;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (var i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.4 + 0.1
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 230, 118, ' + p.alpha + ')';
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      }

      // Draw connection lines between close particles
      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x;
          var dy = particles[i].y - particles[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = 'rgba(0, 230, 118, ' + (0.06 * (1 - dist / 120)) + ')';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
  });
})();

// ============================================
// PAGE TRANSITION OVERLAY
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  var overlay = document.createElement('div');
  overlay.className = 'page-transition';
  document.body.appendChild(overlay);
  setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 700);
});

// ============================================
// BUTTON RIPPLE EFFECT
// ============================================
document.addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if (!btn) return;
  var rect = btn.getBoundingClientRect();
  var ripple = document.createElement('span');
  ripple.className = 'ripple';
  var size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(function() { ripple.remove(); }, 600);
});

// ============================================
// HASH CLICK-TO-COPY
// ============================================
document.addEventListener('click', function(e) {
  if (!e.target.classList.contains('hash')) return;
  var fullHash = e.target.getAttribute('title') || e.target.innerText;
  navigator.clipboard.writeText(fullHash).then(function() {
    var tip = document.createElement('span');
    tip.className = 'hash-copied';
    tip.innerText = 'Copied!';
    e.target.appendChild(tip);
    setTimeout(function() { tip.remove(); }, 1200);
  });
});
