// Клиентский модуль виджета «ТОП 3 ПО ЛАЙКАМ»
window.initLikersUI = function(socket) {
    const listEl = document.getElementById('top-likers-list');
    if (!listEl) return;

    function render(likers) {
        listEl.innerHTML = '';
        if (!likers || likers.length === 0) {
            listEl.innerHTML = '<div style="color: #888; font-size: 12px;">Ждём тапы...</div>';
            return;
        }
        likers.forEach((liker, index) => {
            const place = index + 1;
            const avatarHtml = liker.avatar
                ? '<img src="' + liker.avatar + '" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid #ff00aa; object-fit: cover;">'
                : '<div style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid #ff00aa; background: #111;"></div>';
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            item.innerHTML =
                '<div style="color: #ff00aa; font-weight: bold; font-size: 14px; min-width: 18px;">' + place + '.</div>' +
                avatarHtml +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="#ff0055" style="flex-shrink: 0;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
                '<div style="color: #00ff55; font-weight: bold; font-size: 14px;">' + liker.likes + '</div>';
            listEl.appendChild(item);
        });
    }

    socket.on('update_top_likers', (likers) => {
        render(likers);
    });

    render([]);
};
