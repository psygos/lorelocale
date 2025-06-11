// Only loaded by city pages to add small interactions

(function () {
  // State management
  let currentCard = null;
  let currentFragment = null;

  // Wait for DOM to load
  document.addEventListener('DOMContentLoaded', function() {
    // Entry button
    const enterBtn = document.getElementById('enter-btn');
    const entryScreen = document.getElementById('entry-screen');
    const mapScreen = document.getElementById('map-screen');
    
    if (enterBtn) {
      enterBtn.addEventListener('click', function() {
        entryScreen.classList.add('fade-out');
        mapScreen.classList.add('active');
      });
    }

    // Back link
    const backLink = document.getElementById('back-link');
    if (backLink) {
      backLink.addEventListener('click', function(e) {
        e.preventDefault();
        entryScreen.classList.remove('fade-out');
        mapScreen.classList.remove('active');
        closeAllCards();
        closeAllFragments();
      });
    }

    // Set up all markers
    const markers = document.querySelectorAll('.marker');
    markers.forEach(marker => {
      marker.addEventListener('click', function(e) {
        e.stopPropagation();
        const placeId = this.getAttribute('data-place');
        if (placeId) {
          showCard(placeId, e);
        }
      });
    });

    // Set up all fragments
    const fragments = document.querySelectorAll('.fragment');
    fragments.forEach(fragment => {
      fragment.addEventListener('click', function(e) {
        e.stopPropagation();
        const fragmentId = this.getAttribute('data-fragment');
        if (fragmentId) {
          showFragment(fragmentId, e);
        }
      });
    });

    // Set up close buttons for cards
    const cardCloseButtons = document.querySelectorAll('.place-close');
    cardCloseButtons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const card = this.closest('.place-card');
        if (card) {
          card.classList.remove('show');
          currentCard = null;
        }
      });
    });

    // Set up close buttons for fragments
    const fragmentCloseButtons = document.querySelectorAll('.fragment-close');
    fragmentCloseButtons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const fragment = this.closest('.fragment-expanded');
        if (fragment) {
          fragment.classList.remove('show');
          currentFragment = null;
        }
      });
    });

    // Click outside to close
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.place-card') && 
          !e.target.closest('.marker') && 
          !e.target.closest('.fragment-expanded') && 
          !e.target.closest('.fragment')) {
        closeAllCards();
        closeAllFragments();
      }
    });

    // Update time
    updateTime();
    setInterval(updateTime, 60000);
  });

  function showCard(placeId, event) {
    closeAllCards();
    closeAllFragments();
    
    const card = document.getElementById('card-' + placeId);
    if (!card) return;
    
    const marker = event.currentTarget;
    const rect = marker.getBoundingClientRect();
    
    positionElement(card, rect, 420, 400);
    card.classList.add('show');
    currentCard = card;
  }

  function showFragment(fragmentId, event) {
    closeAllFragments();
    closeAllCards();
    
    const fragment = document.getElementById('fragment-' + fragmentId);
    if (!fragment) return;
    
    const source = event.currentTarget;
    const rect = source.getBoundingClientRect();
    
    positionElement(fragment, rect, 500, 200);
    fragment.classList.add('show');
    currentFragment = fragment;
  }

  function positionElement(element, rect, width, height) {
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.top + rect.height + 10;
    
    // Keep on screen horizontally
    if (left + width > window.innerWidth - 20) {
      left = window.innerWidth - width - 20;
    }
    if (left < 20) {
      left = 20;
    }
    
    // Keep on screen vertically
    if (top + height > window.innerHeight - 20) {
      top = rect.top - height - 10;
    }
    if (top < 20) {
      top = 20;
    }
    
    element.style.left = left + 'px';
    element.style.top = top + 'px';
  }

  function closeAllCards() {
    const cards = document.querySelectorAll('.place-card');
    cards.forEach(card => {
      card.classList.remove('show');
    });
    currentCard = null;
  }

  function closeAllFragments() {
    const fragments = document.querySelectorAll('.fragment-expanded');
    fragments.forEach(fragment => {
      fragment.classList.remove('show');
    });
    currentFragment = null;
  }

  // Update local time display
  function updateTime() {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const time = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
    const timeEl = document.getElementById('time');
    if (timeEl) {
      timeEl.textContent = `${day}, ${time}`;
    }
  }
})();
