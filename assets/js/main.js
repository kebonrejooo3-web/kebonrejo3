document.addEventListener('DOMContentLoaded', () => {
  // Mobile Menu Toggle
  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      document.body.classList.toggle('menu-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
    });

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        document.body.classList.remove('menu-open');
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Transparent Header on Scroll Handler
  const header = document.getElementById('siteHeader') || document.querySelector('.site-header');
  if (header) {
    const updateHeaderState = () => {
      if (window.scrollY > 60) {
        header.classList.add('is-scrolled', 'scrolled');
      } else {
        header.classList.remove('is-scrolled', 'scrolled');
      }
    };
    updateHeaderState();
    window.addEventListener('scroll', updateHeaderState, { passive: true });
  }

  // Dynamic Current Year if element present
  const year = document.getElementById('currentYear');
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // Gallery Filter Controls (3 filters: Semua, Dusun, KKN)
  const filterButtons = document.querySelectorAll('.gallery-filter__button[data-filter]');
  const galleryItems = document.querySelectorAll('.gallery-item[data-category]');

  if (filterButtons.length > 0 && galleryItems.length > 0) {
    filterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const selected = button.dataset.filter;

        filterButtons.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');

        galleryItems.forEach((item) => {
          const show = selected === 'all' || item.dataset.category === selected;
          if (show) {
            item.classList.remove('hidden');
          } else {
            item.classList.add('hidden');
          }
        });
      });
    });
  }

  // Active Navigation Scroll Spy
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.main-nav a[href^="#"]');

  if (sections.length > 0 && navLinks.length > 0) {
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach((link) => {
            const href = link.getAttribute('href').replace('#', '');
            if (href === id) {
              link.classList.add('active');
            } else {
              link.classList.remove('active');
            }
          });
        }
      });
    }, observerOptions);

    sections.forEach((section) => observer.observe(section));
  }
});
