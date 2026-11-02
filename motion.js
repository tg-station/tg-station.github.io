// TG 스크롤 · 인터랙션 모션 (전 페이지 공통, GSAP 필요)
// 마크업 규칙
//   data-split         제목을 단어 단위 블러 리빌 (data-split="manual"이면 페이지에서 직접 재생)
//   data-up            블록 페이드업 (같은 순간 화면에 들어온 것끼리 순차 재생)
//   data-up-group      자식 요소를 순차 페이드업 (data-stagger로 간격 조정 가능)
//   data-light         이미지가 어두운 상태에서 밝아지며 등장
//   data-count         숫자 카운트업 (data-up-group 안에 있으면 그룹과 함께 재생)
// 페이지 <head>에서 documentElement에 'motion' 클래스를 붙여 초기 숨김 상태를 만듭니다.
(() => {
  // 모션 설정값은 여기서만 조정합니다.
  const MOTION = {
    word:   { duration: 1.0, ease: 'expo.out',   stagger: 0.08, y: 40, blur: 10, blurMobile: 4 },
    up:     { duration: 0.9, ease: 'power3.out', stagger: 0.1,  y: 60, delay: 0.15 },
    light:  { duration: 1.6, ease: 'power2.out', brightness: 0.3, scale: 1.04 },
    count:  { duration: 1.2, ease: 'power3.out' },
    swap:   { duration: 0.6, ease: 'power3.out', y: 12 },
    trigger: '0px 0px -25% 0px'   // 화면에 25% 들어왔을 때 시작
  };
  const root = document.documentElement;
  const api = window.TGMotion = { MOTION, enabled: false };
  if (!window.gsap || !('IntersectionObserver' in window)) { root.classList.remove('motion'); return; }
  api.enabled = true;

  const reduce = api.reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const blur = matchMedia('(max-width:767px)').matches ? MOTION.word.blurMobile : MOTION.word.blur;
  const W = MOTION.word, U = MOTION.up;
  const wordFrom = reduce ? { opacity: 0 } : { opacity: 0, y: W.y, filter: `blur(${blur}px)` };
  const upFrom = api.upFrom = reduce ? { opacity: 0 } : { opacity: 0, y: U.y };

  // 제목을 단어 단위 span으로 나눔 (<br>은 유지)
  api.split = el => {
    const words = [];
    [...el.childNodes].forEach(n => {
      if (n.nodeType !== 3) return;
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(t => {
        if (!t) return;
        if (/^\s+$/.test(t)) return frag.append(t);
        const s = document.createElement('span');
        s.className = 'm-word'; s.textContent = t;
        frag.append(s); words.push(s);
      });
      n.replaceWith(frag);
    });
    gsap.set(words, wordFrom);
    el.style.visibility = 'visible';
    return words;
  };
  api.playWords = (words, delay = 0) =>
    gsap.to(words, { opacity: 1, y: 0, filter: 'blur(0px)', duration: W.duration, ease: W.ease, stagger: W.stagger, delay, clearProps: 'filter,transform' });
  api.playUp = (els, { delay = 0, stagger = U.stagger, y = U.y, onComplete } = {}) =>
    gsap.fromTo(els, reduce ? { opacity: 0 } : { opacity: 0, y }, { opacity: 1, y: 0, duration: U.duration, ease: U.ease, stagger, delay, clearProps: 'transform', onComplete });

  api.countUp = (el, delay = 0) => {
    const end = parseFloat(el.textContent), o = { v: 0 };
    if (reduce || !end) return;
    el.textContent = '0';
    gsap.to(o, { v: end, duration: MOTION.count.duration, ease: MOTION.count.ease, delay, onUpdate: () => { el.textContent = Math.round(o.v); } });
  };

  // 내용이 바뀔 때 (추천 결과 등) 살짝 내려갔다 올라오며 교체
  api.swap = els => {
    if (reduce) return gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: MOTION.swap.duration });
    gsap.fromTo(els, { opacity: 0, y: MOTION.swap.y }, { opacity: 1, y: 0, duration: MOTION.swap.duration, ease: MOTION.swap.ease, stagger: 0.06, clearProps: 'transform' });
  };

  // 한 번만 재생되는 스크롤 리빌
  api.onEnter = (el, fn) => {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { io.disconnect(); fn(); }
    }), { rootMargin: MOTION.trigger });
    io.observe(el);
  };

  // 제목
  document.querySelectorAll('[data-split]').forEach(el => {
    if (el.dataset.split === 'manual') return;
    const words = api.split(el);
    api.onEnter(el, () => api.playWords(words));
  });

  // 단일 블록: 같은 순간 들어온 것끼리 순차 재생
  const upIO = new IntersectionObserver(es => {
    const hits = es.filter(e => e.isIntersecting).map(e => e.target)
      .sort((a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1);
    if (!hits.length) return;
    hits.forEach(el => upIO.unobserve(el));
    api.playUp(hits, { delay: U.delay });
  }, { rootMargin: MOTION.trigger });
  document.querySelectorAll('[data-up]').forEach(el => upIO.observe(el));

  // 그룹: 자식 순차 페이드업 + 안의 숫자 카운트업. 끝나면 'tg:revealed' 이벤트
  document.querySelectorAll('[data-up-group]').forEach(group => {
    gsap.set(group.children, upFrom);
    api.onEnter(group, () => {
      const items = [...group.children];
      const stagger = parseFloat(group.dataset.stagger) || U.stagger;
      group.removeAttribute('data-up-group'); // 이후 다시 그려지는 자식은 숨기지 않음
      api.playUp(items, { stagger, onComplete: () => group.dispatchEvent(new Event('tg:revealed')) });
      items.forEach((it, i) => it.querySelectorAll('[data-count]').forEach(n => api.countUp(n, i * stagger + 0.2)));
    });
  });

  // 이미지 라이트업
  document.querySelectorAll('[data-light]').forEach(el => api.onEnter(el, () => {
    const L = MOTION.light;
    gsap.fromTo(el, reduce ? { opacity: 0 } : { opacity: 0, filter: `brightness(${L.brightness})`, scale: L.scale },
      { opacity: 1, filter: 'brightness(1)', scale: 1, duration: L.duration, ease: L.ease, clearProps: 'filter,transform' });
  }));

  // 그룹 밖의 숫자
  document.querySelectorAll('[data-count]').forEach(el => {
    if (el.closest('[data-up-group]')) return;
    api.onEnter(el, () => api.countUp(el, U.delay));
  });
})();
