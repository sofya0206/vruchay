/* global document, location, window */
// Заглушка «нет связи» (offline.html): повтор по кнопке и сам,
// как только связь вернулась, — открываем то, что человек и просил.
document.getElementById('retry').addEventListener('click', function () {
  location.reload();
});
window.addEventListener('online', function () {
  location.reload();
});
