/* Adds the weekly catalog-based review entry point to the Progress experience. */
(() => {
  function addReviewButton() {
    const card = document.querySelector('.advance-card');
    if (!card || document.querySelector('[data-action="weekly-review"]')) return;
    const button = document.createElement('button');
    button.className = 'btn lime weekly-review-button';
    button.dataset.action = 'weekly-review';
    button.textContent = 'Revisar mi plan semanal ✦';
    card.append(button);
  }
  document.addEventListener('click', () => setTimeout(addReviewButton, 0));
  addReviewButton();
})();
