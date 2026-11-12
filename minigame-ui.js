// Клиентский модуль отрисовки мини-игры «ПАТРИОТ!»
(function() {
    let voteQueue = [];
    let isShowingQueue = false;

    function formatTime(sec) {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function processVoteQueue() {
        if (isShowingQueue || voteQueue.length === 0) return;
        isShowingQueue = true;
        const current = voteQueue.shift();

        const avatarWidget = document.getElementById('avatar-widget');
        const avatarBox = document.getElementById('mg-avatar-box');
        const flagEl = document.getElementById('center-leader-flag');
        const nickEl = document.getElementById('streamer-nick');
        const actionEl = document.getElementById('mg-action-word');

        // Показываем виджет аватара в центре кольца эквалайзера
        if (avatarWidget) avatarWidget.style.opacity = '1';

        if (current.avatar) {
            // Реальная ссылка на аватар зрителя
            avatarBox.innerHTML = `<img src="${current.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;border:2px solid #00ffff;box-shadow:0 0 10px #00ffff;">`;
        } else {
            // На тесте нет ссылки — круг картинки пуст, виден только цветной кружок страны, ник и действие
            avatarBox.innerHTML = '';
        }

        flagEl.style.display = 'block';
        flagEl.style.background = current.color;
        nickEl.innerText = current.name;

        if (actionEl) {
            if (current.isPlus) {
                actionEl.innerText = `ДАЛ! (${current.countryName})`;
                actionEl.style.color = '#00ff55';
            } else {
                actionEl.innerText = `ЗАБРАЛ! (${current.countryName})`;
                actionEl.style.color = '#ff0055';
            }
            actionEl.style.display = 'block';
        }

        const delay = 3000;
        setTimeout(() => {
            isShowingQueue = false;
            const badgeEl = document.getElementById('mg-patriot-badge');
            const patriotActive = badgeEl && badgeEl.style.display !== 'none';
            // Если очередь пуста и нет активного победителя ПАТРИОТ! — плавно скрываем виджет
            if (voteQueue.length === 0 && !patriotActive) {
                const aw = document.getElementById('avatar-widget');
                if (aw) aw.style.opacity = '0';
            }
            processVoteQueue();
        }, delay);
    }

    window.initMiniGameUI = function(socket) {
        socket.on('minigame_timer', (data) => {
            const timerEl = document.getElementById('mg-timer');
            if (!timerEl) return;
            timerEl.innerText = data.phase === 'active' ? `БИТВА: ${formatTime(data.timeLeft)}` : `ПЕРЕРЫВ: ${formatTime(data.timeLeft)}`;
            timerEl.style.color = data.phase === 'active' ? '#00ffff' : '#ff00aa';
        });

        socket.on('minigame_vote_queue', (item) => {
            voteQueue.push(item);
            processVoteQueue();
        });

        socket.on('minigame_state', (state) => {
            const timerEl = document.getElementById('mg-timer');
            const barContainer = document.getElementById('mg-bar-container');
            const barFill = document.getElementById('mg-bar-fill');
            const leaderText = document.getElementById('mg-leader-text');
            const badgeEl = document.getElementById('mg-patriot-badge');
            const avatarBox = document.getElementById('mg-avatar-box');
            const avatarWidget = document.getElementById('avatar-widget');
            const flagEl = document.getElementById('center-leader-flag');
            const nickEl = document.getElementById('streamer-nick');
            const actionEl = document.getElementById('mg-action-word');

            if (timerEl) {
                timerEl.style.display = '';
                timerEl.innerText = state.phase === 'active'
                    ? `БИТВА: ${formatTime(state.timeLeft)}`
                    : `ПЕРЕРЫВ: ${formatTime(state.timeLeft)}`;
                timerEl.style.color = state.phase === 'active' ? '#00ffff' : '#ff00aa';
            }

            if (state.phase === 'active') {
                badgeEl.style.display = 'none';
                if (actionEl) actionEl.style.display = 'none';
                barContainer.style.display = 'block';
                leaderText.style.display = 'block';

                // При старте нового раунда (нет лидера и победителя) скрываем виджет аватара
                if (!state.leaderCountry && !state.winnerData) {
                    if (avatarWidget) avatarWidget.style.opacity = '0';
                }

                if (state.leaderCountry) {
                    barFill.style.width = state.leaderCountry.percent + '%';
                    barFill.style.backgroundColor = state.leaderCountry.color;
                    leaderText.innerText = `${state.leaderCountry.name}: ${state.leaderCountry.percent}%`;
                } else {
                    barFill.style.width = '0%';
                    leaderText.innerText = '0% (Пиши +страна)';
                }
            } else {
                voteQueue = [];
                barContainer.style.display = 'none';
                leaderText.style.display = 'none';

                if (state.winnerData) {
                    badgeEl.style.display = 'block';
                    nickEl.innerText = `${state.winnerData.name} (${state.winnerData.countryName})`;
                    flagEl.style.display = 'block';
                    flagEl.style.background = state.winnerData.color;
                    // В фазе cooldown держим виджет аватара видимым с его аватаркой
                    if (avatarWidget) avatarWidget.style.opacity = '1';
                    if (state.winnerData.avatar) {
                        avatarBox.innerHTML = `<img src="${state.winnerData.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;border:2px solid #00ffff;box-shadow:0 0 10px #00ffff;">`;
                    } else {
                        avatarBox.innerText = 'ПОБЕДА';
                        avatarBox.style.color = '#ffcc00';
                    }
                } else {
                    // Ничья в раунде — нет победителя ПАТРИОТ!, скрываем виджет аватара
                    if (avatarWidget) avatarWidget.style.opacity = '0';
                    badgeEl.style.display = 'none';
                    nickEl.innerText = 'Ничья в раунде';
                    flagEl.style.display = 'none';
                }
            }
        });
    };
})();
