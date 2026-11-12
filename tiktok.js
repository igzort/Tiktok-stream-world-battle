// Модуль связи с TikTok Live (tiktok-live-connector).
// Подключается к никнейму 'weareghor', обрабатывает чат/подарки/подсчёт зрителей
// и автоматически переподключается каждые 15 секунд, пока стрим не запустится.
const { WebcastPushConnection } = require('tiktok-live-connector/legacy');

module.exports = function initTiktok(io, scores, ALL_COUNTRIES, getSortedScores, miniGame) {
    const USERNAME = 'weareghor';
    const RECONNECT_INTERVAL = 15000;

    // Связка uniqueId -> объект страны из ALL_COUNTRIES
    const registeredUsers = {};
    let currentViewers = 10;

    let connection = null;
    let reconnectTimer = null;

    // Поиск страны по русскому названию (без учёта регистра)
    function findCountryByName(inputName) {
        const clean = String(inputName || '').trim().toLowerCase();
        return ALL_COUNTRIES.find(c => c.name.toLowerCase() === clean);
    }

    function clearReconnectTimer() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function scheduleReconnect() {
        clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
            console.log('[TikTok] Попытка переподключения к @' + USERNAME + '...');
            try {
                connect();
            } catch (e) {
                console.error('[TikTok] Ошибка при переподключении:', e.message || e);
                scheduleReconnect();
            }
        }, RECONNECT_INTERVAL);
    }

    function connect() {
        if (connection) {
            try { connection.disconnect(); } catch (e) {}
            connection = null;
        }

        connection = new WebcastPushConnection(USERNAME);

        connection.on('connected', () => {
            console.log('[TikTok] Подключено к стриму @' + USERNAME);
        });

        connection.on('chat', (data) => {
            try {
                const comment = String(data.comment || '').trim();
                if (!comment) return;

                // 1) Регистрация страны через !страна (без учёта регистра)
                if (comment.startsWith('!')) {
                    const country = findCountryByName(comment.slice(1));
                    if (country) {
                        registeredUsers[data.uniqueId] = country;
                        console.log('[TikTok] Chat: ', data.nickname, 'зарегистрировал страну', country.name);
                    }
                    return;
                }

                // 2) Команда мини-игры +страна / -страна
                if (comment.startsWith('+') || comment.startsWith('-')) {
                    miniGame.handleChatCommand(
                        data.uniqueId,
                        data.nickname,
                        data.profilePictureUrl || '',
                        comment,
                        currentViewers
                    );
                }
            } catch (e) {
                console.error('[TikTok] Ошибка обработки чата:', e.message || e);
            }
        });

        connection.on('gift', (data) => {
            try {
                // Пропускаем промежуточные подарки комбо-серии — ждём окончания серии, чтобы не дублировать очки
                if (data.giftType === 1 && !data.repeatEnd) return;

                // Зритель без зарегистрированной страны (!страна) строго игнорируется
                if (!registeredUsers[data.uniqueId]) return;

                const country = registeredUsers[data.uniqueId];
                const code = country.code;

                // ЛЮБОЙ подарок зарегистрированного пользователя влияет на шкалу мини-игры «ПАТРИОТ!»
                const totalCoins = (data.diamondCount || 1) * (data.repeatCount || 1);
                const handledByMiniGame = miniGame.handleGiftVote(
                    data.uniqueId,
                    data.nickname,
                    data.profilePictureUrl || '',
                    country,
                    totalCoins,
                    currentViewers
                );
                if (handledByMiniGame === true) {
                    return; // очки пошли только в шкалу мини-игры, не дублируем в общую таблицу
                }
                // Если раунд не активен — ниже начисляем очки в общую таблицу как обычно

                if (!scores[code]) {
                    scores[code] = { country: code, name: country.name, points: 0, color: '#ffffff' };
                }
                scores[code].points += totalCoins;

                io.emit('update_scores', getSortedScores());
                console.log('[TikTok] Gift: ', data.uniqueId, '+', coins, 'очков для', country.name);
            } catch (e) {
                console.error('[TikTok] Ошибка обработки подарка:', e.message || e);
            }
        });

        connection.on('roomUser', (data) => {
            try {
                currentViewers = data.viewerCount || 10;
                if (miniGame && typeof miniGame.setViewerCount === 'function') miniGame.setViewerCount(currentViewers);
            } catch (e) {
                console.error('[TikTok] Ошибка обновления зрителей:', e.message || e);
            }
        });

        connection.on('disconnected', () => {
            console.log('[TikTok] Отключено от стрима');
            scheduleReconnect();
        });

        connection.on('streamEnd', () => {
            console.log('[TikTok] Эфир завершён');
            scheduleReconnect();
        });

        connection.on('error', (err) => {
            console.error('[TikTok] Ошибка:', err && (err.message || err));
        });

        try {
            const result = connection.connect();
            if (result && typeof result.catch === 'function') {
                result.catch((err) => {
                    console.error('[TikTok] Ошибка подключения (promise):', err && (err.message || err));
                    scheduleReconnect();
                });
            }
        } catch (e) {
            console.error('[TikTok] Ошибка подключения:', e.message || e);
            scheduleReconnect();
        }
    }

    // Первый запуск (в try/catch, чтобы сервер не падал до начала эфира)
    try {
        connect();
    } catch (e) {
        console.error('[TikTok] Ошибка первого подключения:', e.message || e);
        scheduleReconnect();
    }

    return { registeredUsers };
};
