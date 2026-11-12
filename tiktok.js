// Модуль связи с TikTok Live через локальный мост TikFinity Desktop (WebSocket).
// Подключается к ws://localhost:21213/, обрабатывает чат/подарки/подсчёт зрителей
// и автоматически переподключается каждые 5 секунд при обрыве.
const WebSocket = require('ws');

module.exports = function initTiktok(io, scores, ALL_COUNTRIES, getSortedScores, miniGame) {
    const WS_URL = 'ws://localhost:21213/';
    const RECONNECT_INTERVAL = 5000;

    // Связка uniqueId -> объект страны из ALL_COUNTRIES
    const registeredUsers = {};
    let currentViewers = 10;
    const userLikes = {};

    let connection = null;
    let reconnectTimer = null;

    // Поиск страны по русскому названию (без учёта регистра)
    function findCountryByName(inputName) {
        const clean = String(inputName || '').trim().toLowerCase();
        return ALL_COUNTRIES.find(c => c.name.toLowerCase() === clean);
    }

    function getTop3Likers() {
        return Object.values(userLikes)
            .sort((a, b) => b.likes - a.likes)
            .slice(0, 3);
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
            console.log('[TikFinity] Попытка переподключения к локальному мосту (порт 21213)...');
            try {
                connect();
            } catch (e) {
                console.error('[TikFinity] Ошибка при переподключении:', e.message || e);
                scheduleReconnect();
            }
        }, RECONNECT_INTERVAL);
    }

    function connect() {
        if (connection) {
            try { connection.close(); } catch (e) {}
            connection = null;
        }

        connection = new WebSocket(WS_URL);

        connection.on('open', () => {
            console.log('[TikFinity] Подключено к локальному мосту TikTok (порт 21213)!');
        });

        connection.on('message', (raw) => {
            try {
                const packet = JSON.parse(raw.toString());
                const event = packet.event;
                const data = packet.data;

                if (event === 'chat') {
                    try {
                        const comment = String(data.comment || '').trim();
                        if (!comment) return;

                        const user = data;

                        // 1) Регистрация страны через !страна (без учёта регистра)
                        if (comment.startsWith('!')) {
                            const country = findCountryByName(comment.slice(1));
                            if (country) {
                                registeredUsers[user.uniqueId] = country;
                                console.log('[TikTok] Chat: ', user.nickname, 'зарегистрировал страну', country.name);
                            }
                            return;
                        }

                        // 2) Команда мини-игры +страна / -страна
                        if (comment.startsWith('+') || comment.startsWith('-')) {
                            miniGame.handleChatCommand(
                                user.uniqueId,
                                user.nickname,
                                user.profilePictureUrl || '',
                                comment,
                                currentViewers
                            );
                        }
                    } catch (e) {
                        console.error('[TikTok] Ошибка обработки чата:', e.message || e);
                    }
                } else if (event === 'gift') {
                    try {
                        const user = data;

                        // Пропускаем промежуточные подарки комбо-серии — ждём окончания серии, чтобы не дублировать очки
                        if (data.giftType === 1 && !data.repeatEnd) return;

                        // Зритель без зарегистрированной страны (!страна) строго игнорируется
                        if (!registeredUsers[user.uniqueId]) return;

                        const country = registeredUsers[user.uniqueId];
                        const code = country.code;

                        // ЛЮБОЙ подарок зарегистрированного пользователя влияет на шкалу мини-игры «ПАТРИОТ!»
                        const totalCoins = (data.diamondCount || 1) * (data.repeatCount || 1);
                        const handledByMiniGame = miniGame.handleGiftVote(
                            user.uniqueId,
                            user.nickname,
                            user.profilePictureUrl || '',
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
                        console.log('[TikTok] Gift: ', user.uniqueId, '+', totalCoins, 'очков для', country.name);
                    } catch (e) {
                        console.error('[TikTok] Ошибка обработки подарка:', e.message || e);
                    }
                } else if (event === 'roomUser') {
                    try {
                        currentViewers = data.viewerCount || 10;
                        if (miniGame && typeof miniGame.setViewerCount === 'function') miniGame.setViewerCount(currentViewers);
                    } catch (e) {
                        console.error('[TikTok] Ошибка обновления зрителей:', e.message || e);
                    }
                } else if (event === 'like') {
                    try {
                        const user = data;
                        const uid = user.uniqueId;
                        if (!uid) return;
                        if (!userLikes[uid]) {
                            userLikes[uid] = { name: user.nickname || 'Неизвестно', avatar: user.profilePictureUrl || '', likes: 0 };
                        }
                        userLikes[uid].likes += Number(data.likeCount) || 1;
                        userLikes[uid].name = user.nickname || userLikes[uid].name;
                        userLikes[uid].avatar = user.profilePictureUrl || userLikes[uid].avatar;
                        io.emit('update_top_likers', getTop3Likers());
                    } catch (e) {
                        console.error('[TikTok] Ошибка обработки лайка:', e.message || e);
                    }
                }
            } catch (e) {
                console.error('[TikFinity] Ошибка парсинга сообщения:', e.message || e);
            }
        });

        connection.on('close', () => {
            console.log('[TikFinity] Соединение с локальным мостом разорвано');
            scheduleReconnect();
        });

        connection.on('error', (err) => {
            console.error('[TikFinity] Ошибка WebSocket:', err && (err.message || err));
            scheduleReconnect();
        });
    }

    // Первый запуск (в try/catch, чтобы сервер не падал до запуска моста)
    try {
        connect();
    } catch (e) {
        console.error('[TikFinity] Ошибка первого подключения:', e.message || e);
        scheduleReconnect();
    }

    return { registeredUsers, getTop3Likers };
};
