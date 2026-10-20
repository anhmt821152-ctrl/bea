const escapeHTML = (str) => str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[tag] || tag));
  
function getBadge(score) {
    if (score >= 1200) return { name: 'Kim cương', color: '#B9F2FF' };
    if (score >= 700) return { name: 'Vàng', color: '#FFD700' };
    if (score >= 300) return { name: 'Bạc', color: '#C0C0C0' };
    return { name: 'Đồng', color: '#cd7f32' };
}

function createCarSVG(color) {
    return `<svg class="car-svg" viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M10,30 L10,20 L30,10 L70,10 L90,20 L95,30 Z" fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle class="wheel" cx="25" cy="30" r="8" fill="#333" stroke="#fff" stroke-width="2"/>
        <circle class="wheel" cx="75" cy="30" r="8" fill="#333" stroke="#fff" stroke-width="2"/>
    </svg>`;
}
