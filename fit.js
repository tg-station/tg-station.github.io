// 1440px 데스크톱 디자인을 화면 폭에 맞춰 같은 비율로 축소·확대합니다.
// UI_SCALE: 디자인 대비 전체 크기 (0.95 = 95%)
(() => {
  const UI_SCALE = 0.95;
  const BASE = 1440 / UI_SCALE;
  const root = document.documentElement;
  const fit = () => {
    const w = root.clientWidth;
    const z = w >= 768 ? w / BASE : 1;
    root.style.zoom = z === 1 ? '' : z;
    // 첫 화면을 브라우저 높이에 꽉 채우기 위한 높이 (디자인 기준 px)
    root.style.setProperty('--screen-h', Math.max(innerHeight / z, 640) + 'px');
  };
  fit();
  // 내용이 생기면서 세로 스크롤바가 붙으면 폭이 줄어드므로 다시 맞춥니다.
  addEventListener('DOMContentLoaded', fit);
  addEventListener('load', fit);
  addEventListener('resize', fit);
})();
