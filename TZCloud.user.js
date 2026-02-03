// ==UserScript==
// @name         SEO Subdomain Automation Suite
// @namespace    http://tampermonkey.net/
// @version      4.6.18
// @description  v4.6.18 - Расширенная таблица базы (CMS/hreflang/статус/заметки), автосохранение полей при создании ТЗ, исправлен импорт/экспорт
// @author       Timur - Head of Automation
// @match        https://app.asana.com/*
// @match        https://best-seo-crm.top/*
// @match        https://seo-team.top/*
// @match        *://*/**
// @match        about:blank
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @require      https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js
// @connect      app.asana.com
// @connect      api.asana.com
// @connect      seo-team.top
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // ===== DEBUG РЕЖИМ =====
    const DEBUG = false;
    const PROFILE = false; // v4.5.2 диагностика производительности // v4.3.3: Включите true для отладки

    // v4.3.7: УНИВЕРСАЛЬНОЕ ПРАВИЛО - блокируем всплытие событий клавиатуры в shadowRoot
    // Вызывать после создания shadowRoot для предотвращения перехвата событий сайтом Asana
    function preventKeyboardEventBubbling(shadowRoot) {
        ['keydown', 'keyup', 'keypress'].forEach(eventType => {
            shadowRoot.addEventListener(eventType, (e) => {
                if (e.target.matches('input, textarea, select, [contenteditable]')) {
                    e.stopPropagation();
                }
            }, true);  // capture phase для раннего перехвата
        });
    }

    // Отладка: вывод базы при загрузке
    setTimeout(() => {
        if (DEBUG) {
            const db = JSON.parse(GM_getValue('sitesDatabase', '{}'));
            console.log('🗄️ sitesDatabase при загрузке:');
            console.log('   Всего доменов:', Object.keys(db).length);
            for (const d in db) {
                console.log(`   📁 ${d}:`);
                console.log(`      oldSubdomains: ${db[d].oldSubdomains?.length || 0}`, db[d].oldSubdomains);
                console.log(`      currentSubdomain: ${db[d].currentSubdomain}`);
            }
        }
    }, 2000);

    if(DEBUG) console.log('📦 SEO Subdomain Automation Suite v4.0 загружен');
    if(DEBUG) console.log('🌐 Сайт:', window.location.hostname);
    if(DEBUG) console.log('📄 Путь:', window.location.pathname);

    // ===== TOAST УВЕДОМЛЕНИЯ (замена alert) =====
    function showToast(message, type = 'info', duration = 4000) {
        // Создаём контейнер если нет
        let container = document.getElementById('seo-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'seo-toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: '📋' };
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            warning: '#FF9800',
            info: '#2196F3'
        };

        toast.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 14px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            max-width: 350px;
            pointer-events: auto;
            animation: toastSlideIn 0.3s ease;
            cursor: pointer;
            white-space: pre-line;
        `;

        toast.innerHTML = `${icons[type] || icons.info} ${message}`;
        toast.onclick = () => toast.remove();

        // Добавляем анимацию
        if (!document.getElementById('seo-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'seo-toast-styles';
            style.textContent = `
                @keyframes toastSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes toastSlideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        container.appendChild(toast);

        // Автоудаление
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ===== КОНФИГУРАЦИЯ =====
    const CONFIG = {
        asana: {
            token: '2/1212671934125653/1212743260004727:260f44116749986a3985117a03438c5f',
            workspaceGid: '1203521034265209',
            projects: {
                'AI.test': '1212745296715942',
                'EMD': '1212745296715942',
                'SODA': '1212745296715942',
                'Testlab': '1212745296715942',
                'Flex': '1212745296715942',
            },
            // Workspace-level custom fields (AI.test)
            customFields: {
                percentAllocation: '1206553443965194',
                priority: {
                    fieldGid: '1211220807800450',
                    options: {
                        high: '1211220807800453',
                        medium: '1211220807800454',
                        low: '1211220807800455'
                    }
                }
            },
            developers: {
                'Ai.test': ['1212671934125653'],
                'laravel': ['1212671934125653'],
                'wordpress': ['1212671934125653'],
                'static': ['1212671934125653']
            }
        },
        rocketChat: {
            webhookUrl: 'https://seo-team.top/hooks/6964e09b2ebc15c75bbe8c5b/Y8mTzNSwErS8oScaEm94Zb5JgmbTCRsf7tQGKEKBo8iXZBgG',
            // API для получения списка пользователей
            apiUrl: 'https://seo-team.top/api/v1',
            authToken: 'M_A7Pmp2cAZhC-cGeG7M_f_05j1-dVOmsmyz69evnPq',
            userId: 'LMia7cMEZbsupTGPR',
            channels: {
                'AI.test': '@Timur_Head_Automation',
                'EMD': '@Timur',
                'SODA': '@username',      // TODO: указать получателя
                'Testlab': '@username',   // TODO: указать получателя
                'Flex': '@username'       // TODO: указать получателя
            }
        },
        // v4.5.6: Облачные настройки с 5 endpoints для load balancing
        cloud: {
            defaultGoogleScriptUrl: `https://script.google.com/macros/s/AKfycbwq08qRMZYNgUqOg6weME7rseCOaQhR1P-_qA2tb9gKhpl907a0esax-43vvwBuxpiN/exec
https://script.google.com/macros/s/AKfycbyWW9UvRXSPAU7wtkamoBvb9PQMC2Ec_uxv5Dsa5q9mOAK4ranAPFSXAn9QhJuLLFy7tw/exec
https://script.google.com/macros/s/AKfycbxX1DGUQcozFg2qCEYwOXXNl3rRzJy0XRuPoags74NowBb7B8IINr-Ff2xkXlrsfonmRw/exec
https://script.google.com/macros/s/AKfycbxYiSUd2dYm5YZLXi6tzcap-vWcPd5bigplbD-uzrxnCvIELwjx3IRw1x7ixHU1EhDnHA/exec
https://script.google.com/macros/s/AKfycbzVKwCJ4T2jS75ckn3c1PBQaTp_N_0jo-aM2_TrwnwKT3N-k9LVqvosGwKTP2E0cF-5BA/exec`
            // Credentials устанавливаются пользователем при первом запуске
        }
    };

    // ===== v4.5.3: АВТОРИЗАЦИЯ ДЛЯ ОБЛАЧНЫХ СЕРВИСОВ =====
    // Логин/пароль вводятся пользователем при первом запуске
    // Хранятся в GM_setValue (безопасно для GitHub Pages)

    function getCloudAuth() {
        const savedAuth = GM_getValue('cloudAuth', null);
        if (savedAuth) {
            try {
                return JSON.parse(savedAuth);
            } catch(e) {}
        }
        return null; // Не установлено
    }

    function isCloudAuthSet() {
        return getCloudAuth() !== null;
    }

    function saveCloudAuth(username, password) {
        GM_setValue('cloudAuth', JSON.stringify({ username, password }));
    }

    function validateCloudAuth(username, password) {
        const auth = getCloudAuth();
        if (!auth) return false;
        return auth.username === username && auth.password === password;
    }

    function encodeAuthForRequest(username, password) {
        return btoa(username + ':' + password);
    }

    // v4.5.3: Модалка первичной настройки credentials
    function showInitialAuthSetup(onComplete) {
        const host = document.createElement('div');
        host.id = 'seo-auth-setup-host';
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        preventKeyboardEventBubbling(shadow);

        shadow.innerHTML = `
            <style>
                .auth-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .auth-modal {
                    background: #2d2d2d;
                    border-radius: 12px;
                    padding: 24px;
                    width: 360px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                    color: #fff;
                }
                .auth-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0 0 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .auth-subtitle {
                    font-size: 13px;
                    color: #999;
                    margin: 0 0 20px 0;
                }
                .auth-field {
                    margin-bottom: 16px;
                }
                .auth-field label {
                    display: block;
                    font-size: 13px;
                    color: #aaa;
                    margin-bottom: 6px;
                }
                .auth-field input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #444;
                    border-radius: 6px;
                    background: #3a3a3a;
                    color: #fff;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                .auth-field input:focus {
                    outline: none;
                    border-color: #4CAF50;
                }
                .auth-btn {
                    width: 100%;
                    padding: 12px;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    background: #4CAF50;
                    color: white;
                    margin-top: 8px;
                }
                .auth-btn:hover { background: #45a049; }
                .auth-btn:disabled {
                    background: #555;
                    cursor: not-allowed;
                }
                .auth-error {
                    color: #f44336;
                    font-size: 12px;
                    margin-top: 8px;
                    display: none;
                }
            </style>
            <div class="auth-overlay">
                <div class="auth-modal">
                    <h3 class="auth-title">🔐 Первичная настройка</h3>
                    <p class="auth-subtitle">Установите логин и пароль для облачных сервисов</p>

                    <div class="auth-field">
                        <label>Логин:</label>
                        <input type="text" id="setup-username" placeholder="Введите логин" autocomplete="off" />
                    </div>

                    <div class="auth-field">
                        <label>Пароль:</label>
                        <input type="password" id="setup-password" placeholder="Введите пароль" autocomplete="off" />
                    </div>

                    <div class="auth-error" id="auth-error"></div>

                    <button class="auth-btn" id="setup-save">💾 Сохранить</button>
                </div>
            </div>
        `;

        const usernameInput = shadow.getElementById('setup-username');
        const passwordInput = shadow.getElementById('setup-password');
        const saveBtn = shadow.getElementById('setup-save');
        const errorEl = shadow.getElementById('auth-error');

        saveBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            // Валидация
            if (!username) {
                errorEl.textContent = '❌ Введите логин';
                errorEl.style.display = 'block';
                return;
            }
            if (!password) {
                errorEl.textContent = '❌ Введите пароль';
                errorEl.style.display = 'block';
                return;
            }

            // Сохраняем
            saveCloudAuth(username, password);
            host.remove();
            showToast('✅ Авторизация настроена!', 'success');
            if (onComplete) onComplete();
        });

        // Enter для сохранения
        [usernameInput, passwordInput].forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') saveBtn.click();
            });
        });

        // Фокус на первое поле
        setTimeout(() => usernameInput.focus(), 100);
    }

    // ===== ТИПОВЫЕ ПОДЗАДАЧИ ПО ОТДЕЛАМ =====
    const DEFAULT_SUBTASK_TEMPLATES = {
        'SEO': [
            { name: 'Переиндекс GSC', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'Переиндекс TG', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'QA-проверка', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'Обновить CRM', priority: 'low', allocation: 1, assignee: '' }
        ],
        'DEV': [
            { name: 'Выполнить переезд хрефлангами на поддомен по ТЗ', priority: 'high', allocation: 1, assignee: '' },
            { name: 'Проверить, находится ли домен в приоритетных DMCA списках', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'Проверить, не находится ли сайт в процессе SEO.App', priority: 'medium', allocation: 1, assignee: '' }
        ],
        'Актуализация ссылок': [
            { name: 'Актуализировать ссылки в footer', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'Актуализировать ссылки в header', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'Актуализировать ссылки в боковом меню', priority: 'medium', allocation: 1, assignee: '' },
            { name: 'Актуализировать ссылки в sitemap', priority: 'medium', allocation: 1, assignee: '' }
        ]
    };

    // ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ТИПОВЫМИ ПОДЗАДАЧАМИ =====
    function loadSubtaskTemplates() {
        const saved = GM_getValue('subtaskTemplates');
        if (saved) {
            return JSON.parse(saved);
        }
        return DEFAULT_SUBTASK_TEMPLATES;
    }

    function saveSubtaskTemplates(templates) {
        GM_setValue('subtaskTemplates', JSON.stringify(templates));
    }

    // ===== ФУНКЦИИ ДЛЯ МАППИНГА ASANA → ROCKET.CHAT =====
    function loadRocketChatMapping() {
        const saved = GM_getValue('rocketChatMapping');
        if (saved) {
            return JSON.parse(saved);
        }
        return {}; // { asanaGid: 'rocketChatUsername', ... }
    }

    function saveRocketChatMapping(mapping) {
        GM_setValue('rocketChatMapping', JSON.stringify(mapping));
    }

    // ===== ФУНКЦИИ ДЛЯ ROCKET.CHAT API =====
    function loadRocketUsersFromCache() {
        const cache = JSON.parse(GM_getValue('rocketUsersCache', '{"data":[],"lastUpdated":null}'));
        return cache;
    }

    function saveRocketUsersToCache(users) {
        const cache = {
            data: users,
            lastUpdated: new Date().toISOString()
        };
        GM_setValue('rocketUsersCache', JSON.stringify(cache));
        if(DEBUG) console.log('✅ Rocket.Chat users сохранены в кеш:', users.length, 'пользователей');
    }

    function isRocketUsersCacheExpired() {
        const cache = loadRocketUsersFromCache();
        if (!cache.lastUpdated) return true;
        const lastUpdated = new Date(cache.lastUpdated);
        const now = new Date();
        // Кеш устаревает через 24 часа
        const dayInMs = 24 * 60 * 60 * 1000;
        return (now - lastUpdated) > dayInMs;
    }

    function fetchRocketUsersFromAPI() {
        return new Promise((resolve, reject) => {
            if (!CONFIG.rocketChat.authToken || !CONFIG.rocketChat.userId) {
                console.warn('⚠️ Rocket.Chat API не настроен (нет authToken или userId)');
                resolve([]);
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: `${CONFIG.rocketChat.apiUrl}/users.list?count=0`,
                headers: {
                    'X-Auth-Token': CONFIG.rocketChat.authToken,
                    'X-User-Id': CONFIG.rocketChat.userId
                },
                onload: (response) => {
                    if (response.status === 200) {
                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.success && result.users) {
                                const users = result.users.map(u => ({
                                    id: u._id,
                                    username: u.username,
                                    name: u.name || u.username,
                                    status: u.status
                                })).filter(u => u.username); // Только с username
                                saveRocketUsersToCache(users);
                                resolve(users);
                            } else {
                                reject(new Error('Invalid response from Rocket.Chat API'));
                            }
                        } catch (e) {
                            reject(new Error('Failed to parse Rocket.Chat response'));
                        }
                    } else if (response.status === 401) {
                        reject(new Error('Rocket.Chat: Неверный токен авторизации'));
                    } else {
                        reject(new Error(`Rocket.Chat API error: ${response.status}`));
                    }
                },
                onerror: () => reject(new Error('Network error при запросе к Rocket.Chat'))
            });
        });
    }

    // Автоматический маппинг Asana → Rocket.Chat по совпадению имён
    // v4.5.3: Автомаппинг только по ТОЧНОМУ совпадению имени
    function autoMapAsanaToRocket(asanaMembers, rocketUsers) {
        const mapping = loadRocketChatMapping();
        let newMappings = 0;

        asanaMembers.forEach(asanaMember => {
            // Пропускаем если уже есть маппинг
            if (mapping[asanaMember.gid]) return;

            const asanaName = (asanaMember.name || '').toLowerCase().trim();
            if (!asanaName) return;

            // Ищем ТОЛЬКО точное совпадение имени в Rocket.Chat
            const rocketMatch = rocketUsers.find(rocketUser => {
                const rocketName = (rocketUser.name || '').toLowerCase().trim();
                return rocketName === asanaName;
            });

            if (rocketMatch) {
                mapping[asanaMember.gid] = '@' + rocketMatch.username;
                newMappings++;
                if(DEBUG) console.log(`✅ Автомаппинг (точное совпадение): ${asanaMember.name} → @${rocketMatch.username}`);
            }
            // Если нет точного совпадения - не логируем, пользователь выберет сам
        });

        if (newMappings > 0) {
            saveRocketChatMapping(mapping);
            if(DEBUG) console.log(`✅ Автоматически замаплено ${newMappings} пользователей (точное совпадение)`);
        }

        const totalMapped = Object.keys(mapping).length;
        if(DEBUG) console.log(`📊 Всего в маппинге: ${totalMapped} пользователей`);

        return mapping;
    }

    // v4.3.7: Синхронизация маппинга Asana → Rocket.Chat из кешей
    function syncAsanaRocketMapping() {
        const teamCache = loadTeamMembersFromCache();
        const rocketCache = loadRocketUsersFromCache();

        if (!teamCache.data || teamCache.data.length === 0) {
            if(DEBUG) console.log('⏭️ Нет кеша team members, пропускаем синхронизацию маппинга');
            return;
        }

        if (!rocketCache.data || rocketCache.data.length === 0) {
            if(DEBUG) console.log('⏭️ Нет кеша Rocket.Chat users, пропускаем синхронизацию маппинга');
            return;
        }

        if(DEBUG) console.log(`🔄 Синхронизация маппинга: ${teamCache.data.length} Asana users ↔ ${rocketCache.data.length} Rocket users`);
        const mapping = autoMapAsanaToRocket(teamCache.data, rocketCache.data);
        if(DEBUG) console.log('📊 Текущий маппинг:', mapping);
    }

    // ===== ШАБЛОНЫ HREFLANG =====
    const DEFAULT_TEMPLATES = [
        {
            name: 'RU',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="ru" href="https://{{newSub}}/" />'
        },
        {
            name: 'AZ',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="az" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="ru" href="https://{{newSub}}/" />'
        },
        {
            name: 'Универсальный (ru-KZ)',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="ru" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="ru-KZ" href="https://{{newSub}}/" />'
        },
        // v4.5.6: Новые hreflang шаблоны
        {
            name: 'DE',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="de" href="https://{{newSub}}/" />'
        },
        {
            name: 'PL',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="pl" href="https://{{newSub}}/" />'
        },
        {
            name: 'TR',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="tr" href="https://{{newSub}}/" />'
        },
        {
            name: 'FR',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="fr" href="https://{{newSub}}/" />'
        },
        {
            name: 'IT',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="it" href="https://{{newSub}}/" />'
        },
        {
            name: 'EN',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="en" href="https://{{newSub}}/" />'
        },
        {
            name: 'ES',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="es" href="https://{{newSub}}/" />'
        },
        {
            name: 'BN',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="bn" href="https://{{newSub}}/" />'
        },
        {
            name: 'CS',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="cs" href="https://{{newSub}}/" />'
        },
        {
            name: 'RU-RU',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="ru-RU" href="https://{{newSub}}/" />'
        },
        {
            name: 'TR-TR + AZ-TR',
            code: '<link rel="canonical" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="x-default" href="https://{{domain}}/" />\n<link rel="alternate" hreflang="tr-TR" href="https://{{newSub}}/" />\n<link rel="alternate" hreflang="az-TR" href="https://{{newSub}}/" />'
        }
    ];

    // ===== v4.5.0: РЕЕСТР ПОЛЕЙ ДЛЯ ТИПОВ ЗАДАЧ =====
    const FIELD_REGISTRY = {
        // === Базовые поля ===
        taskName: {
            id: 'taskName',
            label: 'Задача',
            type: 'text',
            variable: '{{taskName}}',
            defaultValue: 'Смена поддомена',
            placeholder: 'Название задачи',
            width: 'medium',
            aliases: ['задача', 'task', 'название', 'name', 'тип']
        },
        department: {
            id: 'department',
            label: 'Отдел',
            type: 'select',
            variable: '{{department}}',
            options: 'departments', // специальный тип - загружается динамически
            width: 'small',
            aliases: ['отдел', 'department', 'dept', 'команда', 'team']
        },
        domain: {
            id: 'domain',
            label: 'Домен',
            type: 'text',
            variable: '{{domain}}',
            placeholder: 'example.com',
            autocomplete: 'sitesDatabase',
            validation: 'domain',
            width: 'medium',
            aliases: ['домен', 'domain', 'сайт', 'site', 'drop', 'дроп', 'основной домен', 'currentdomain']
        },

        // === Поля для поддоменов ===
        oldSub: {
            id: 'oldSub',
            label: 'Старый поддомен',
            type: 'text',
            variable: '{{oldSub}}',
            placeholder: 'old.example.com',
            depends: 'domain',
            autocomplete: 'oldSubdomains',
            width: 'medium',
            aliases: ['старый поддомен', 'старый', 'old', 'oldsub', 'oldsubdomain', 'old subdomain', 'from', 'откуда']
        },
        newSub: {
            id: 'newSub',
            label: 'Новый поддомен',
            type: 'text',
            variable: '{{newSub}}',
            placeholder: 'new.example.com',
            depends: 'domain',
            autocomplete: 'newSubdomain',
            width: 'medium',
            aliases: ['новый поддомен', 'новый', 'new', 'newsub', 'newsubdomain', 'new subdomain', 'to', 'куда']
        },
        alternateDomain: {
            id: 'alternateDomain',
            label: 'Домен подмены',
            type: 'text',
            variable: '{{alternateDomain}}',
            placeholder: 'alternate.com',
            width: 'medium',
            aliases: ['домен подмены', 'подмена', 'alternate', 'alt', 'altdomain', 'alternatedomain', 'альт', 'замена']
        },
        redirect: {
            id: 'redirect',
            label: 'Редирект',
            type: 'select',
            variable: '{{redirect}}',
            options: [
                { value: '301', label: '301' },
                { value: '404', label: '404' }
            ],
            defaultValue: '301',
            width: 'tiny',
            aliases: ['редирект', 'redirect', '301', '404']
        },
        hreflang: {
            id: 'hreflang',
            label: 'hreflang',
            type: 'select',
            variable: '{{hreflangCode}}',  // результат - сгенерированный код
            options: 'hreflangTemplates', // специальный тип - загружается динамически
            width: 'small',
            aliases: ['hreflang', 'хрефланг', 'geo', 'гео', 'язык', 'lang', 'region', 'регион']
        },

        // === Общие поля ===
        priority: {
            id: 'priority',
            label: 'Приоритет',
            type: 'select',
            variable: '{{priority}}',
            options: [
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' }
            ],
            defaultValue: 'medium',
            width: 'tiny',
            aliases: ['приоритет', 'priority', 'prio', 'важность']
        },
        cms: {
            id: 'cms',
            label: 'CMS',
            type: 'select',
            variable: '{{cms}}',
            options: [
                { value: '', label: '—' },
                { value: 'wordpress', label: 'WordPress' },
                { value: 'laravel', label: 'Laravel' },
                { value: 'static', label: 'Static' },
                { value: 'joomla', label: 'Joomla' },
                { value: 'drupal', label: 'Drupal' },
                { value: 'other', label: 'Other' }
            ],
            width: 'small',
            aliases: ['cms', 'цмс', 'движок', 'engine', 'платформа']
        },
        dmca: {
            id: 'dmca',
            label: 'DMCA',
            type: 'checkbox',
            variable: '{{dmca}}',
            defaultValue: false,
            width: 'tiny',
            aliases: ['dmca', 'дмка']
        },
        amp: {
            id: 'amp',
            label: 'AMP',
            type: 'select',
            variable: '{{amp}}',
            options: [
                { value: '', label: '—' },
                { value: 'domain', label: 'На домене' },
                { value: 'subdomain', label: 'На поддомене' },
                { value: 'both', label: 'На обоих' }
            ],
            defaultValue: '',
            width: 'small',
            aliases: ['amp', 'амп', 'accelerated']
        },
        assignee: {
            id: 'assignee',
            label: 'Ответственный',
            type: 'select',
            variable: '{{assignee}}',
            options: 'rocketChatUsers', // специальный тип - загружается из маппинга
            width: 'medium',
            aliases: ['ответственный', 'assignee', 'исполнитель', 'executor', 'owner']
        },

        // === Поля для редиректов (будущее) ===
        fromUrl: {
            id: 'fromUrl',
            label: 'URL откуда',
            type: 'text',
            variable: '{{fromUrl}}',
            placeholder: 'https://old.example.com/page',
            width: 'large',
            aliases: ['url откуда', 'from url', 'source', 'источник']
        },
        toUrl: {
            id: 'toUrl',
            label: 'URL дропа (301/404)',
            type: 'text',
            variable: '{{toUrl}}',
            placeholder: 'https://drop.example.com/',
            width: 'large',
            aliases: ['url дропа', 'tourl', 'to url', 'url куда', 'drop url', 'дроп', 'target url', 'целевой url', 'url 301', 'url 404', '301/404']
        },
        // v4.5.6: URL страниц для отдачи 404 (может быть несколько)
        oldUrl: {
            id: 'oldUrl',
            label: 'oldURL',
            type: 'textarea',
            variable: '{{oldUrl}}',
            placeholder: 'https://site.com/page1/\nhttps://site.com/page2/',
            width: 'large',
            aliases: ['oldurl', 'old url', 'url 404', 'страницы 404', 'старые url', 'старые страницы', 'pages 404', 'url для 404']
        },

        // === Кастомные текстовые поля ===
        notes: {
            id: 'notes',
            label: 'Примечания',
            type: 'textarea',
            variable: '{{notes}}',
            placeholder: 'Дополнительная информация...',
            width: 'full',
            aliases: ['примечания', 'notes', 'комментарий', 'comment', 'заметки']
        },
        pingRocket: {
            id: 'pingRocket',
            label: 'Пинг',
            type: 'checkbox',
            variable: '{{pingRocket}}',
            defaultValue: false,
            width: 'tiny',
            aliases: ['пинг', 'ping', 'pingrocket', 'уведомление', 'notify']
        }
    };

    // ===== v4.5.0: УМНЫЙ ИМПОРТ - сопоставление колонок =====

    // Маппинг hreflang geo → templateIndex
    const HREFLANG_GEO_MAP = {
        'ru': 0,
        'russia': 0,
        'россия': 0,
        'az': 1,
        'azerbaijan': 1,
        'азербайджан': 1,
        'kz': 2,
        'ru-kz': 2,
        'kazakhstan': 2,
        'казахстан': 2,
        'универсальный': 2
    };

    // Функция сопоставления заголовка колонки с полем
    function matchColumnToField(columnHeader) {
        if (!columnHeader) return null;
        const header = String(columnHeader).toLowerCase().trim();

        // Загружаем пользовательские настройки aliases и custom fields
        const userSettings = loadFieldSettings() || {};
        const customFields = userSettings._customFields || [];

        // Объединяем все поля
        const allFields = { ...FIELD_REGISTRY };
        customFields.forEach(cf => {
            allFields[cf.id] = cf;
        });

        // Проходим по всем полям
        for (const [fieldId, field] of Object.entries(allFields)) {
            // Точное совпадение с label
            if (field.label.toLowerCase() === header) return fieldId;

            // Точное совпадение с id
            if (fieldId.toLowerCase() === header) return fieldId;

            // Сначала проверяем пользовательские aliases (только точное совпадение)
            const userAliases = userSettings[fieldId]?.aliases;
            if (userAliases && userAliases.length > 0) {
                for (const alias of userAliases) {
                    if (header === alias.toLowerCase()) return fieldId;
                }
            }

            // Затем проверяем дефолтные aliases (только точное совпадение)
            if (field.aliases) {
                for (const alias of field.aliases) {
                    if (header === alias.toLowerCase()) return fieldId;
                }
            }
        }

        return null; // неизвестная колонка
    }

    // Функция преобразования значения hreflang geo → templateIndex
    function parseHreflangGeo(value) {
        if (!value) return '';
        const val = String(value).toLowerCase().trim();

        // Если это уже число - возвращаем как есть
        if (!isNaN(parseInt(val))) return val;

        // Ищем в маппинге
        if (HREFLANG_GEO_MAP.hasOwnProperty(val)) {
            return String(HREFLANG_GEO_MAP[val]);
        }

        return ''; // не найдено - пустой (—)
    }

    // v4.5.0: Загрузка/сохранение пользовательских настроек полей
    const FIELD_SETTINGS_KEY = 'seo_subdomain_field_settings';

    function loadFieldSettings() {
        try {
            const saved = localStorage.getItem(FIELD_SETTINGS_KEY);
            if(DEBUG) console.log('loadFieldSettings raw:', saved);
            if (saved) {
                const parsed = JSON.parse(saved);
                if(DEBUG) console.log('loadFieldSettings parsed:', parsed);
                return parsed;
            }
        } catch (e) {
            console.warn('Failed to load field settings:', e);
        }
        return null; // используем дефолтные из FIELD_REGISTRY
    }

    function saveFieldSettings(settings) {
        try {
            const json = JSON.stringify(settings);
            if(DEBUG) console.log('saveFieldSettings:', json);
            localStorage.setItem(FIELD_SETTINGS_KEY, json);
        } catch (e) {
            console.error('Failed to save field settings:', e);
        }
    }

    // Получить поле с учётом пользовательских настроек
    // REVIEW: getFieldConfig - подготовлено для будущего использования в FieldConfigModal
    // Не удалять, может понадобиться для динамической конфигурации полей
    function getFieldConfig(fieldId) {
        const defaultField = FIELD_REGISTRY[fieldId];
        if (!defaultField) return null;

        const userSettings = loadFieldSettings();
        if (userSettings && userSettings[fieldId]) {
            return { ...defaultField, ...userSettings[fieldId] };
        }
        return defaultField;
    }

    // ===== v4.5.0: ТИПЫ ЗАДАЧ (шаблоны) =====
    const DEFAULT_TASK_TYPES = {
        // v4.5.7: Обновлённые шаблоны согласно ТЗ
        subdomain: {
            id: 'subdomain',
            name: 'Повторная смена поддомена',
            icon: '🌐',
            fields: [
                { fieldId: 'taskName', enabled: true, required: true },
                { fieldId: 'department', enabled: true, required: false },
                { fieldId: 'domain', enabled: true, required: false },
                { fieldId: 'oldSub', enabled: true, required: false },
                { fieldId: 'newSub', enabled: true, required: false },
                { fieldId: 'hreflang', enabled: true, required: false },
                { fieldId: 'amp', enabled: false, required: false },
                { fieldId: 'priority', enabled: true, required: false },
                { fieldId: 'notes', enabled: false, required: false }
            ],
            tzTemplate: `1) Отключить поддомен:
https://{{oldSub}}/

2) Создать страницу на дропе (дубль главной):
https://{{newSub}}/

3) На главной странице и внутряке (https://{{domain}}/ и https://{{newSub}}/) прописать канониклы и хрефланги:
{{hreflangCode}}
Меняем старые канониклы и хрефланги на новые

Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`,
            subtaskTemplates: ['SEO', 'DEV'],
            reportColumns: ['domain', 'asanaUrl']
        },
        redirect301: {
            id: 'redirect301',
            name: 'Снос 301 и установка поддомена',
            icon: '↪️',
            fields: [
                { fieldId: 'taskName', enabled: true, required: true },
                { fieldId: 'department', enabled: true, required: false },
                { fieldId: 'domain', enabled: true, required: false },
                { fieldId: 'toUrl', enabled: true, required: false },
                { fieldId: 'oldUrl', enabled: true, required: false },
                { fieldId: 'newSub', enabled: true, required: false },
                { fieldId: 'hreflang', enabled: true, required: false },
                { fieldId: 'amp', enabled: false, required: false },
                { fieldId: 'notes', enabled: false, required: false }
            ],
            tzTemplate: `1) Снести 301 редирект с https://{{domain}}/ на https://{{toUrl}}/

{{oldUrlFormatted}}

2) Создать страницу на дропе (дубль главной):
https://{{newSub}}/

3) На главной странице и поддомене (https://{{domain}}/ и https://{{newSub}}/) прописать канониклы и хрефланги:
{{hreflangCode}}
Меняем старые канониклы и хрефланги на новые

Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`
        },
        // v4.5.7: НОВЫЙ шаблон - Запуск на поддомене
        subdomainLaunch: {
            id: 'subdomainLaunch',
            name: 'Запуск на поддомене',
            icon: '🚀',
            fields: [
                { fieldId: 'taskName', enabled: true, required: true },
                { fieldId: 'department', enabled: true, required: false },
                { fieldId: 'domain', enabled: true, required: false },
                { fieldId: 'newSub', enabled: true, required: false },
                { fieldId: 'hreflang', enabled: true, required: false },
                { fieldId: 'notes', enabled: false, required: false }
            ],
            tzTemplate: `1) Создать страницу на дропе (дубль главной):
https://{{newSub}}/

2) На главной странице и поддомене (https://{{domain}}/ и https://{{newSub}}/) прописать канониклы и хрефланги:
{{hreflangCode}}
Меняем старые канониклы и хрефланги на новые

Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`
        },
        // v4.6.17: Новый шаблон - Отключить хрефланги и внедрить поддомен
        disableHreflang: {
            id: 'disableHreflang',
            name: 'Отключить хрефланги и внедрить поддомен',
            icon: '🏷️❌',
            fields: [
                { fieldId: 'taskName', enabled: true, required: true },
                { fieldId: 'department', enabled: true, required: false },
                { fieldId: 'domain', enabled: true, required: false },
                { fieldId: 'oldUrl', enabled: true, required: false },
                { fieldId: 'newSub', enabled: true, required: false },
                { fieldId: 'hreflang', enabled: true, required: false },
                { fieldId: 'amp', enabled: true, required: false },
                { fieldId: 'notes', enabled: false, required: false }
            ],
            tzTemplate: `1) {{oldUrlFormatted}}

2) Создать страницу на дропе (дубль главной):
https://{{newSub}}/

3) На главной странице и поддомене (https://{{domain}}/ и https://{{newSub}}/) прописать канониклы и хрефланги:
{{hreflangCode}}
Меняем старые канониклы и хрефланги на новые

{{amp}}

Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`
        },
        // v4.6.17: Удалён шаблон redirect404 (дублировал функционал)
        disableAlternateDomain: {
            id: 'disableAlternateDomain',
            name: 'Отключить подмену и внедрить поддомен',
            icon: '🔌',
            fields: [
                { fieldId: 'taskName', enabled: true, required: true },
                { fieldId: 'department', enabled: true, required: false },
                { fieldId: 'domain', enabled: true, required: false },
                { fieldId: 'oldUrl', enabled: true, required: false },
                { fieldId: 'alternateDomain', enabled: true, required: false },
                { fieldId: 'newSub', enabled: true, required: false },
                { fieldId: 'hreflang', enabled: true, required: false },
                { fieldId: 'amp', enabled: false, required: false },
                { fieldId: 'notes', enabled: false, required: false }
            ],
            tzTemplate: `{{oldUrlFormatted}}

1) Домен подмены отключить и не продлять:
https://{{alternateDomain}}/

2) Создать страницу на дропе (дубль главной):
https://{{newSub}}/

3) На главной странице и внутряке (https://{{domain}}/ и https://{{newSub}}/) прописать канониклы и хрефланги:
{{hreflangCode}}
Меняем старые канониклы и хрефланги на новые

Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`
        },
        hreflang: {
            id: 'hreflang',
            name: 'Добавление hreflang',
            icon: '🏷️',
            tzTemplate: `1) На главной странице (https://{{domain}}/) и поддомене (https://{{newSub}}/) прописать канониклы и хрефланги:
{{hreflangCode}}

2) Проверить корректность разметки`
        },
        reindex: {
            id: 'reindex',
            name: 'Переиндексация',
            icon: '🔄',
            tzTemplate: `1) Обновить sitemap на https://{{domain}}/

2) Запросить индексацию в Google Search Console

3) Проверить robots.txt`
        },
        clone: {
            id: 'clone',
            name: 'Клонирование страницы',
            icon: '📋',
            tzTemplate: `1) Создать клон страницы:
Исходный URL: https://{{oldSub}}/
Новый URL: https://{{newSub}}/

2) Скопировать контент и структуру

3) Проверить корректность всех ссылок`
        },
        audit: {
            id: 'audit',
            name: 'SEO аудит',
            icon: '🔍',
            tzTemplate: `Провести SEO аудит сайта https://{{domain}}/

Проверить:
1) Мета-теги (title, description)
2) Канониклы
3) Hreflang разметку
4) Скорость загрузки
5) Мобильную версию
6) Robots.txt и sitemap.xml`
        }
    };

    // ===== v4.5.0: ФУНКЦИИ ДЛЯ РАБОТЫ С ТИПАМИ ЗАДАЧ =====
    function loadTaskTypes() {
        const saved = GM_getValue('taskTypes');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Ошибка парсинга taskTypes:', e);
                return DEFAULT_TASK_TYPES;
            }
        }
        return DEFAULT_TASK_TYPES;
    }

    function saveTaskTypes(types) {
        GM_setValue('taskTypes', JSON.stringify(types));
    }

    // v4.5.0: Получить опции для поля
    // REVIEW: getFieldOptions - подготовлено для динамических опций полей
    function getFieldOptions(fieldDef) {
        if (!fieldDef.options) return [];

        // Специальные типы опций
        if (fieldDef.options === 'departments') {
            return getDepartmentsList().map(d => ({ value: d, label: d }));
        }
        if (fieldDef.options === 'hreflangTemplates') {
            return loadTemplates().map((t, i) => ({ value: String(i), label: t.name }));
        }

        // Обычный массив опций
        if (Array.isArray(fieldDef.options)) {
            return fieldDef.options.map(o => {
                if (typeof o === 'object') return o;
                return { value: o, label: o };
            });
        }

        return [];
    }

    // REVIEW: createEmptyTask - подготовлено для создания задач по типу
    // v4.5.0: Создать пустую задачу по типу
    function createEmptyTask(taskTypeId, taskIdCounter) {
        const taskTypes = loadTaskTypes();
        const schema = taskTypes[taskTypeId];
        if (!schema) return null;

        const task = {
            id: taskIdCounter,
            _taskType: taskTypeId
        };

        schema.fields.forEach(f => {
            const fieldDef = FIELD_REGISTRY[f.fieldId];
            if (fieldDef) {
                if (fieldDef.type === 'checkbox') {
                    task[f.fieldId] = fieldDef.defaultValue || false;
                } else {
                    task[f.fieldId] = fieldDef.defaultValue || '';
                }
            }
        });

        // Специальные поля для совместимости со старым кодом
        task.subtasks = [];
        // v4.5.7: 404 по умолчанию (чаще используется чем 301)
        task.redirect301 = false;
        task.redirect404 = true;
        task.templateIndex = '0';

        return task;
    }

    // ===== ИЗОЛИРОВАННЫЕ СТИЛИ =====
    const ISOLATED_STYLES = `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        .dashboard-container {
            position: fixed;
            top: 50px;
            right: 20px;
            width: 450px;
            max-height: 90vh;
            overflow: hidden;
            background: #ffffff;
            border: 2px solid #4CAF50;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            display: flex;
            flex-direction: column;
        }

        .dashboard-container.mass-mode {
            width: 98vw;
            max-width: 1900px;
            max-height: 95vh;
            left: 50%;
            transform: translateX(-50%);
            right: auto;
        }

        .mode-switcher {
            display: flex;
            gap: 8px;
            padding: 12px 20px;
            background: #f5f5f5;
            border-bottom: 2px solid #e0e0e0;
        }

        .mode-btn {
            flex: 1;
            padding: 10px 16px;
            background: #fff;
            border: 2px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            transition: all 0.2s;
        }

        .mode-btn:hover {
            border-color: #4CAF50;
            color: #4CAF50;
        }

        .mode-btn.active {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            border-color: #4CAF50;
            color: #fff;
            font-weight: 600;
        }

        .mode-container {
            display: none;
        }

        .mode-container.active {
            display: block;
            background: #ffffff;
        }

        .single-mode-content, .mass-mode-content {
            padding: 0;
            background: #ffffff;
        }

        .table-actions {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
            flex-wrap: wrap;
            align-items: center;
            background: #ffffff;
        }

        .table-actions button {
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 500;
            border-radius: 6px;
            cursor: pointer;
            border: none;
        }

        .btn-add-task { background: #4CAF50; color: #fff; }
        .btn-add-task:hover { background: #45a049; }
        .btn-duplicate { background: #2196F3; color: #fff; }
        .btn-duplicate:hover { background: #1976D2; }
        .btn-clear-all { background: #f44336; color: #fff; }
        .btn-clear-all:hover { background: #d32f2f; }
        .btn-import { background: #FF9800; color: #fff; }
        .btn-import:hover { background: #F57C00; }
        .btn-export { background: #00BCD4; color: #fff; }
        .btn-export:hover { background: #0097A7; }
        .btn-settings-mass { background: #546E7A; color: #fff; }
        .btn-settings-mass:hover { background: #455A64; }

        /* v4.5.0: Кнопка выгрузки ТЗ */
        .btn-summary { background: #9C27B0; color: #fff; }
        .btn-summary:hover { background: #7B1FA2; }

        /* v4.5.0: Кнопка облачного сохранения */
        .btn-cloud { background: #03A9F4; color: #fff; }
        .btn-cloud:hover { background: #0288D1; }

        /* v4.5.0: Кнопка типов задач */
        .btn-task-types { background: #607D8B; color: #fff; }
        .btn-task-types:hover { background: #455A64; }

        /* v4.5.0: Кнопка настройки полей */
        .btn-field-settings { background: #795548; color: #fff; }
        .btn-field-settings:hover { background: #5D4037; }

        .tasks-table-container {
            min-height: 180px;  /* v4.3.7: Базово вмещает 2 задачи */
            max-height: 450px;  /* v4.3.7: Расширяется при добавлении */
            overflow: auto;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            margin-bottom: 16px;
            background: #ffffff;
        }

        .tasks-table {
            width: 100%;
            min-width: 1920px;
            background: #ffffff;
        }

        .table-header {
            display: grid;
            grid-template-columns: 35px 40px 150px 80px 140px 140px 140px 140px 60px 140px 90px 80px 70px 50px 90px 100px 45px 55px 65px;
            gap: 6px;
            padding: 12px 10px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: #fff;
            font-weight: 600;
            font-size: 12px;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .table-header .cell-checkbox-all {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .table-header .cell-checkbox-all input {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .required-mark {
            color: #FFD54F;
            margin-left: 2px;
            font-weight: bold;
        }

        .table-body {
            background: #f9f9f9;
        }

        .task-row {
            display: grid;
            grid-template-columns: 35px 40px 150px 80px 140px 140px 140px 140px 60px 140px 90px 80px 70px 50px 90px 100px 45px 55px 65px;
            gap: 6px;
            padding: 10px;
            border-bottom: 1px solid #e0e0e0;
            align-items: start;
            background: #fff;
            transition: background 0.2s;
        }

        .task-row:hover { background: #f0f8f0; }
        .task-row.selected { background: #e3f2fd; }

        .cell-checkbox, .cell-dmca {
            display: flex;
            align-items: center;
            justify-content: center;
            padding-top: 8px;
        }

        .cell-checkbox input, .cell-dmca input {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        /* v4.6.17: AMP теперь select */
        .cell-amp {
            display: flex;
            align-items: center;
        }

        .cell-num {
            width: 30px;
            text-align: center;
            font-weight: 500;
            color: #666;
        }

        /* v4.5.2: Wrapper для поля задачи с кнопкой сброса */
        .cell-task-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }
        .cell-task-wrapper input {
            flex: 1;
            padding-right: 24px;
        }
        .cell-task-wrapper input[readonly] {
            background: #f5f5f5;
            cursor: default;
        }
        .task-clear-btn {
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #e0e0e0;
            color: #666;
            font-size: 12px;
            line-height: 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.15s;
        }
        .task-clear-btn:hover {
            background: #f44336;
            color: #fff;
        }

        .cell-task input, .cell-domain input, .cell-oldsub input, .cell-newsub input {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 13px;
            background: #fff;
            color: #333;
        }

        .cell-department select, .cell-template select, .cell-priority select, .cell-cms select, .cell-amp select, .cell-assignee select {
            width: 100%;
            padding: 8px 6px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 13px;
            background: #fff;
            color: #333;
        }

        .redirect-checkboxes {
            display: flex;
            gap: 8px;
            margin-top: 4px;
            font-size: 11px;
        }

        .redirect-checkboxes label {
            display: flex;
            align-items: center;
            gap: 3px;
            cursor: pointer;
            color: #666;
        }

        .redirect-checkboxes input {
            width: 14px;
            height: 14px;
        }

        .cell-subtasks {
            display: flex;
            align-items: center;
            gap: 4px;
            padding-top: 6px;
            position: relative;
        }

        .cell-assignee {
            display: flex;
            align-items: center;
        }
        .cell-assignee select:focus {
            outline: none;
            border-color: #4CAF50;
        }

        /* Ячейка Пинг с тумблером */
        .cell-ping {
            display: flex;
            align-items: center;
            justify-content: center;
            padding-top: 6px;
        }

        /* Toggle switch стили */
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
            cursor: pointer;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            border-radius: 20px;
            transition: 0.3s;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            border-radius: 50%;
            transition: 0.3s;
        }
        .toggle-switch input:checked + .toggle-slider {
            background-color: #2196F3;
        }
        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(16px);
        }

        .subtasks-count {
            background: #9C27B0;
            color: #fff;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 20px;
            text-align: center;
            cursor: pointer;
            position: relative;
            transition: background 0.2s;
        }

        .subtasks-count:hover {
            background: #7B1FA2;
        }

        .subtasks-count.empty {
            background: #bdbdbd;
            cursor: default;
        }

        .subtasks-count.empty:hover {
            background: #bdbdbd;
        }

        /* v4.3.7: Быстрый tooltip для подзадач */
        .subtasks-count[data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: 100%;
            transform: translateX(-50%);
            background: #333;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            white-space: pre-line;
            z-index: 1000;
            min-width: 150px;
            max-width: 250px;
            text-align: left;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            margin-bottom: 5px;
            animation: tooltipFadeIn 0.15s ease;
        }

        .subtasks-count[data-tooltip]:hover::before {
            content: '';
            position: absolute;
            left: 50%;
            bottom: 100%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: #333;
            margin-bottom: -7px;
            z-index: 1001;
        }

        @keyframes tooltipFadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(5px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* v4.6.12: Счётчик oldUrl - кликабельный */
        .oldurl-count {
            background: #FF9800;
            color: #fff;
            font-size: 12px;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 12px;
            min-width: 40px;
            text-align: center;
            cursor: pointer;
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            transition: background 0.2s;
        }

        .oldurl-count:hover {
            background: #F57C00;
        }

        .oldurl-count.empty {
            background: #e0e0e0;
            color: #666;
        }

        .oldurl-count.empty:hover {
            background: #bdbdbd;
        }

        .oldurl-count[data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: 100%;
            transform: translateX(-50%);
            background: #333;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 11px;
            white-space: pre-line;
            z-index: 1000;
            margin-bottom: 6px;
            min-width: 180px;
            max-width: 300px;
            text-align: left;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .oldurl-count[data-tooltip]:hover::before {
            content: '';
            position: absolute;
            left: 50%;
            bottom: 100%;
            transform: translateX(-50%);
            border: 6px solid transparent;
            border-top-color: #333;
            margin-bottom: -1px;
            z-index: 1001;
        }

        .cell-actions {
            display: flex;
            align-items: center;
            gap: 4px;
            padding-top: 6px;
        }

        .icon-btn, .icon-btn-delete, .icon-btn-duplicate {
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            border-radius: 4px;
        }

        .icon-btn:hover { background: #e0e0e0; }
        .icon-btn-delete:hover { background: #ffcdd2; }
        .icon-btn-duplicate { color: #1976d2; }
        .icon-btn-duplicate:hover { background: #bbdefb; }

        .empty-table {
            text-align: center;
            padding: 60px 20px;
            color: #999;
            font-size: 16px;
        }

        .cell-with-btn {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .cell-with-btn input,
        .cell-with-btn select {
            flex: 1;
            min-width: 0;
        }

        .cell-settings-btn {
            cursor: pointer;
            font-size: 14px;
            padding: 2px;
            border-radius: 3px;
            opacity: 0.6;
            transition: opacity 0.2s;
        }

        .cell-settings-btn:hover {
            opacity: 1;
            background: #e0e0e0;
        }


        /* v4.2.0: Минималистичные индикаторы - только цвет рамки */
        .input-valid {
            border-color: #4caf50 !important;
            box-shadow: 0 0 0 1px #4caf50 !important;
        }
        .input-error {
            border-color: #f44336 !important;
            box-shadow: 0 0 0 1px #f44336 !important;
        }
        /* v4.5.2: Индикация обязательных пустых полей - только фон внутри */
        .input-required-empty {
            background: #FFF3E0 !important;
        }
        .input-required-empty::placeholder {
            color: #E65100 !important;
        }
        /* v4.5.2: Для select обязательных пустых */
        select.input-required-empty {
            background: #FFF3E0 !important;
        }
        /* v4.6.0: Для textarea и input в ячейках обязательных пустых */
        textarea.input-required-empty {
            background: #FFF3E0 !important;
        }
        .cell-tourl input.input-required-empty,
        .cell-altdomain input.input-required-empty,
        .cell-oldurl textarea.input-required-empty {
            background: #FFF3E0 !important;
            border-color: #FFB74D !important;
        }
        .input-warning-tooltip {
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            background: #ffebee;
            border: 1px solid #f44336;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 12px;
            color: #c62828;
            margin-bottom: 4px;
            z-index: 100;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .input-warning-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 20px;
            border: 6px solid transparent;
            border-top-color: #f44336;
        }

        /* FIX v4.1.8: Окно сравнения www в массовом режиме */
        .www-popup {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #fff3e0;
            border: 1px solid #ff9800;
            border-radius: 6px;
            padding: 8px 12px;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 12px;
            margin-top: 4px;
        }
        .www-popup-title {
            font-weight: 600;
            color: #e65100;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .www-popup-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            border-bottom: 1px dashed #ffe0b2;
        }
        .www-popup-row:last-child {
            border-bottom: none;
        }
        .www-popup-label {
            color: #666;
        }
        .www-popup-value {
            font-family: monospace;
            color: #333;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .www-popup-tag {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 10px;
            margin-left: 6px;
        }
        .www-popup-tag.with-www { background: #c8e6c9; color: #2e7d32; }
        .www-popup-tag.no-www { background: #ffcdd2; color: #c62828; }
        .www-popup-hint {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid #ffe0b2;
            color: #666;
            font-style: italic;
        }
        .cell-oldsub, .cell-newsub, .cell-altdomain, .cell-tourl, .cell-oldurl {
            position: relative;
        }

        .cell-newsub {
            position: relative;
        }

        .cell-altdomain input, .cell-tourl input {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            box-sizing: border-box;
            background: #fff;
            color: #333;
        }
        .cell-altdomain input:focus, .cell-tourl input:focus {
            outline: none;
            border-color: #4CAF50;
        }
        .cell-oldurl .cell-with-btn {
            display: flex;
            align-items: flex-start;
            gap: 4px;
        }
        .cell-oldurl textarea {
            flex: 1;
            padding: 6px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
            box-sizing: border-box;
            background: #fff;
            color: #333;
            min-height: 32px;
            resize: vertical;
        }
        .cell-oldurl textarea:focus {
            outline: none;
            border-color: #4CAF50;
        }

        .dashboard-header {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: #ffffff;
            padding: 16px 20px;
            border-radius: 6px 6px 0 0;
            user-select: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .dashboard-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
            transition: color 0.3s;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .close-btn {
            background: transparent;
            border: none;
            color: #ffffff;
            font-size: 28px;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background 0.2s;
        }

        .close-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .dashboard-content {
            flex: 1;
            padding: 20px;
            padding-bottom: 20px;
            overflow-y: auto;
            min-height: 0; /* важно для flex overflow */
            background: #ffffff;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            font-size: 14px;
            color: #333333;
        }

        .form-input,
        .form-select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
            color: #1f2937;
            background: #ffffff;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-input:focus,
        .form-select:focus {
            outline: none;
            border-color: #4CAF50;
            box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
        }

        .form-input::placeholder {
            color: #9ca3af;
        }

        .history-list {
            margin-top: 6px;
            font-size: 12px;
            color: #6b7280;
            padding: 8px;
            background: #f9fafb;
            border-radius: 4px;
            display: none; /* По умолчанию скрыто */
        }

        .history-list.active {
            display: block;
        }

        .history-item {
            padding: 6px 10px;
            margin: 4px 0;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            color: #374151;
        }

        .history-item:hover {
            background: #e0f2f1;
            border-color: #4CAF50;
            color: #2e7d32;
        }

        .history-empty {
            color: #9ca3af;
            font-style: italic;
        }

        /* Стили для автокомплита доменов */
        .domain-input-wrapper {
            position: relative;
        }

        .domain-validation-indicator {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 20px;
            pointer-events: none;
        }

        .domain-validation-indicator.valid {
            color: #4CAF50;
        }

        .domain-validation-indicator.invalid {
            color: #FF9800;
        }

        .autocomplete-list {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #4CAF50;
            border-top: none;
            border-radius: 0 0 6px 6px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: none;
        }

        .autocomplete-list.active {
            display: block;
        }

        .autocomplete-item {
            padding: 10px 12px;
            cursor: pointer;
            transition: background 0.2s;
            border-bottom: 1px solid #f0f0f0;
        }

        .autocomplete-item:last-child {
            border-bottom: none;
        }

        .autocomplete-item:hover {
            background: #e8f5e9;
        }

        .autocomplete-domain {
            font-weight: 600;
            color: #2e7d32;
            font-size: 14px;
        }

        .autocomplete-meta {
            font-size: 12px;
            color: #666;
            margin-top: 2px;
        }

        .autocomplete-empty {
            padding: 12px;
            text-align: center;
            color: #999;
            font-style: italic;
            font-size: 13px;
        }

        .input-with-settings {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .action-row {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .settings-icon-btn {
            cursor: pointer;
            font-size: 16px;
            padding: 6px 10px;
            border-radius: 4px;
            opacity: 0.7;
            transition: opacity 0.2s, background 0.2s;
            flex-shrink: 0;
        }

        .settings-icon-btn:hover {
            opacity: 1;
            background: #e0e0e0;
        }

        .btn-manage-domains {
            width: 100%;
            padding: 8px 12px;
            background: #9C27B0;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 6px;
        }

        .btn-manage-domains:hover {
            background: #7B1FA2;
        }

        /* Стили для табов в объединённом окне */
        .domains-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            border-bottom: 2px solid #e0e0e0;
        }

        .domains-tab {
            padding: 10px 20px;
            background: transparent;
            border: none;
            border-bottom: 3px solid transparent;
            font-size: 14px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            transition: all 0.2s;
        }

        .domains-tab:hover {
            color: #4CAF50;
        }

        .domains-tab.active {
            color: #4CAF50;
            border-bottom-color: #4CAF50;
        }

        .tab-content {
            animation: fadeIn 0.3s;
        }

        /* Стили для модального окна управления доменами */
        .domains-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000000;
        }

        .domains-modal-content {
            background: white;
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 800px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .domains-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e0e0e0;
        }

        .domains-modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
        }

        .domains-filter {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }

        .domains-filter select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
        }

        .domains-list {
            max-height: 400px;
            overflow-y: auto;
            margin-bottom: 16px;
        }

        .domain-item {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: border-color 0.2s;
        }

        .domain-item:hover {
            border-color: #9C27B0;
        }

        .domain-item-info {
            flex: 1;
        }

        .domain-item-name {
            font-size: 15px;
            font-weight: 600;
            color: #2e7d32;
            margin-bottom: 4px;
        }

        .domain-item-meta {
            font-size: 12px;
            color: #666;
        }

        .domain-item-actions {
            display: flex;
            gap: 8px;
        }

        .domain-edit-btn,
        .domain-delete-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .domain-edit-btn {
            background: #2196F3;
            color: white;
        }

        .domain-edit-btn:hover {
            background: #1976D2;
        }

        .domain-delete-btn {
            background: #f44336;
            color: white;
        }

        .domain-delete-btn:hover {
            background: #d32f2f;
        }

        .domain-add-form {
            background: #e3f2fd;
            border: 2px dashed #2196F3;
            border-radius: 6px;
            padding: 16px;
            margin-top: 16px;
        }

        .domain-add-title {
            font-size: 15px;
            font-weight: 600;
            color: #333;
            margin-bottom: 12px;
        }

        .domain-form-row {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 10px;
            margin-bottom: 12px;
        }

        .domain-form-input,
        .domain-form-select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
        }

        .domain-form-textarea {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
            resize: vertical;
            min-height: 60px;
            width: 100%;
        }

        .domain-form-buttons {
            display: flex;
            gap: 8px;
        }

        .domain-save-btn,
        .domain-cancel-btn,
        .domain-import-btn,
        .domain-export-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .domain-save-btn {
            background: #4CAF50;
            color: white;
        }

        .domain-save-btn:hover {
            background: #45a049;
        }

        .domain-cancel-btn {
            background: #757575;
            color: white;
        }

        .domain-cancel-btn:hover {
            background: #616161;
        }

        .domain-import-btn {
            background: #FF9800;
            color: white;
        }

        .domain-import-btn:hover {
            background: #F57C00;
        }

        .domain-export-btn {
            background: #00BCD4;
            color: white;
        }

        .domain-export-btn:hover {
            background: #0097A7;
        }

        .domains-actions {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }

        /* Стили для модального окна истории поддоменов */
        .history-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000001;
        }

        .history-modal-content {
            background: white;
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 900px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .history-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e0e0e0;
        }

        .history-modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
        }

        .history-stats {
            display: flex;
            gap: 20px;
            margin-bottom: 16px;
            padding: 12px;
            background: #e8f5e9;
            border-radius: 6px;
        }

        .history-stat-item {
            flex: 1;
            text-align: center;
        }

        .history-stat-value {
            font-size: 24px;
            font-weight: 600;
            color: #2e7d32;
        }

        .history-stat-label {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
        }

        .history-domain-group {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 12px;
        }

        .history-domain-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .history-domain-name {
            font-size: 16px;
            font-weight: 600;
            color: #2e7d32;
        }

        .history-domain-count {
            font-size: 12px;
            color: #666;
            background: white;
            padding: 4px 8px;
            border-radius: 12px;
        }

        .history-subdomain-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }

        .history-subdomain-item {
            display: flex;
            align-items: center;
            gap: 6px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 13px;
            color: #333;
        }

        .history-subdomain-text {
            flex: 1;
        }

        .history-subdomain-remove {
            background: #f44336;
            color: white;
            border: none;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .history-subdomain-remove:hover {
            background: #d32f2f;
        }

        .history-clear-domain-btn {
            background: #FF9800;
            color: white;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .history-clear-domain-btn:hover {
            background: #F57C00;
        }

        .history-actions {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }

        .history-import-mode {
            margin-bottom: 12px;
        }

        .history-import-mode label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            color: #333;
            margin-bottom: 4px;
        }

        .btn-manage-history {
            width: 100%;
            padding: 8px 12px;
            background: #00BCD4;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 6px;
        }

        .btn-manage-history:hover {
            background: #0097A7;
        }

        .btn-select-domains {
            padding: 8px 12px;
            background: #FF9800;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-select-domains:hover {
            background: #F57C00;
        }

        /* Стили для модального окна выбора доменов */
        .select-domains-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000001;
        }

        .select-domains-modal-content {
            background: white;
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 700px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .select-domains-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e0e0e0;
        }

        .select-domains-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
        }

        .select-domains-filters {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
            align-items: center;
        }

        .select-domains-filter-label {
            font-size: 14px;
            font-weight: 500;
            color: #333;
        }

        .select-domains-counter {
            background: #FF9800;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 600;
            margin-left: auto;
        }

        .select-domains-list {
            max-height: 400px;
            overflow-y: auto;
            margin-bottom: 16px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 8px;
        }

        .select-domain-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: #f8f9fa;
            border: 2px solid transparent;
            border-radius: 6px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .select-domain-item:hover {
            background: #e8f5e9;
            border-color: #4CAF50;
        }

        .select-domain-item.selected {
            background: #c8e6c9;
            border-color: #4CAF50;
        }

        .select-domain-checkbox {
            width: 20px;
            height: 20px;
            cursor: pointer;
        }

        .select-domain-info {
            flex: 1;
        }

        .select-domain-name {
            font-size: 15px;
            font-weight: 600;
            color: #2e7d32;
            margin-bottom: 4px;
        }

        .select-domain-meta {
            font-size: 12px;
            color: #666;
        }

        .select-domains-actions {
            display: flex;
            gap: 10px;
        }

        .btn-select-all,
        .btn-clear-selection,
        .btn-create-tasks {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-select-all {
            background: #2196F3;
            color: white;
            flex: 1;
        }

        .btn-select-all:hover {
            background: #1976D2;
        }

        .btn-clear-selection {
            background: #757575;
            color: white;
            flex: 1;
        }

        .btn-clear-selection:hover {
            background: #616161;
        }

        .btn-create-tasks {
            background: #4CAF50;
            color: white;
            flex: 2;
        }

        .btn-create-tasks:hover {
            background: #45a049;
        }

        .btn-create-tasks:disabled {
            background: #cccccc;
            cursor: not-allowed;
        }

        .select-domains-empty {
            text-align: center;
            padding: 40px 20px;
            color: #999;
            font-style: italic;
        }

        /* Стили для подсказки о www */
        .www-hint {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            padding: 10px 12px;
            background: #FFF3CD;
            border: 1px solid #FFC107;
            border-radius: 6px;
            animation: fadeIn 0.3s;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .www-hint-icon {
            font-size: 18px;
        }

        .www-hint-text {
            font-size: 13px;
            color: #856404;
            font-weight: 500;
        }

        .www-comparison {
            margin-top: 8px;
            padding: 12px;
            background: #E3F2FD;
            border: 1px solid #2196F3;
            border-radius: 6px;
        }

        .www-comparison-title {
            font-size: 13px;
            font-weight: 600;
            color: #1976D2;
            margin-bottom: 8px;
        }

        .www-comparison-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            background: white;
            border-radius: 4px;
            margin-bottom: 4px;
            font-size: 13px;
        }

        .www-comparison-label {
            font-weight: 500;
            color: #666;
            min-width: 80px;
        }

        .www-comparison-value {
            font-family: 'Courier New', monospace;
            color: #1976D2;
            font-weight: 600;
        }

        .www-match-indicator {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            margin-left: auto;
        }

        .www-match-indicator.match {
            background: #C8E6C9;
            color: #2E7D32;
        }

        .www-match-indicator.mismatch {
            background: #FFCDD2;
            color: #C62828;
        }

        /* Стили для контейнера выбранных доменов */
        .selected-domains-container {
            margin-top: 12px;
            padding: 12px;
            background: #E8F5E9;
            border: 2px solid #4CAF50;
            border-radius: 6px;
        }

        .selected-domains-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .selected-domains-title {
            font-size: 13px;
            font-weight: 600;
            color: #2E7D32;
        }

        .selected-domains-clear {
            padding: 4px 8px;
            background: #F44336;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .selected-domains-clear:hover {
            background: #D32F2F;
        }

        .selected-domains-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .selected-domain-chip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 10px;
            background: white;
            border: 1px solid #81C784;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .selected-domain-chip:hover {
            background: #C8E6C9;
            border-color: #66BB6A;
        }

        .selected-domain-info {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }

        .selected-domain-number {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background: #4CAF50;
            color: white;
            border-radius: 50%;
            font-size: 12px;
            font-weight: 600;
        }

        .selected-domain-name {
            font-size: 14px;
            font-weight: 500;
            color: #2E7D32;
            font-family: 'Courier New', monospace;
        }

        .selected-domain-meta {
            font-size: 11px;
            color: #666;
            margin-left: auto;
            padding-right: 8px;
        }

        .selected-domain-remove {
            background: #F44336;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .selected-domain-remove:hover {
            background: #D32F2F;
        }

            padding: 40px 20px;
            color: #999;
            font-style: italic;
        }

            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 6px;
        }

        .btn-manage-history:hover {
            background: #0097A7;
        }

        .btn-primary {
            width: 100%;
            padding: 12px 16px;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
        }

        .btn-primary:active {
            transform: translateY(0);
        }

        .btn-secondary {
            width: 100%;
            padding: 10px 14px;
            background: #2196F3;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 6px;
        }

        .btn-secondary:hover {
            background: #1976D2;
        }

        .btn-test {
            width: 100%;
            padding: 10px 14px;
            background: #FF9800;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 10px;
        }

        .btn-test:hover {
            background: #F57C00;
        }

        .btn-test-rocket {
            width: 100%;
            padding: 10px 14px;
            background: #9C27B0;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 10px;
        }

        .btn-test-rocket:hover {
            background: #7B1FA2;
        }

        .checkbox-group {
            margin-top: 16px;
        }

        .checkbox-label {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            cursor: pointer;
            font-size: 14px;
            color: #374151;
        }

        .checkbox-input {
            margin-right: 10px;
            width: 18px;
            height: 18px;
            cursor: pointer;
        }

        .divider {
            margin: 20px 0;
            border: none;
            border-top: 1px solid #e5e7eb;
        }

        .status-log {
            margin-top: 16px;
            padding: 12px;
            background: #1a1a2e;
            border-radius: 6px;
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #333;
        }

        .log-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .log-title {
            font-weight: 600;
            color: #fff;
        }

        .log-copy-btn {
            background: #4a5568;
            color: #fff;
            border: none;
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
        }
        .log-copy-btn:hover { background: #5a6578; }
        .log-copy-btn.copied { background: #10b981; }

        .log-content {
            background: #0d0d1a;
            padding: 8px;
            border-radius: 4px;
        }

        .log-content div {
            padding: 2px 0;
            color: #a0aec0;
            font-family: 'Courier New', monospace;
            font-size: 11px;
        }

        /* v4.5.5: Глобальный прогресс-бар - всегда внизу панели */
        .global-progress {
            flex-shrink: 0;
            position: relative;
            height: 32px;
            background: linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%);
            border-top: 2px solid #4CAF50;
            border-radius: 0 0 6px 6px;
        }
        .global-progress-bar {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            background: linear-gradient(90deg, #4CAF50 0%, #8BC34A 50%, #CDDC39 100%);
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 0 0 0 6px;
            box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
        }
        .global-progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 13px;
            font-weight: 700;
            text-shadow: 0 1px 3px rgba(0,0,0,0.9);
            white-space: nowrap;
            z-index: 1;
        }

        .log-success {
            color: #10b981 !important;
        }

        .log-error {
            color: #ef4444 !important;
        }

        .log-warning {
            color: #f59e0b !important;
        }

        /* Модальное окно */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000000;
        }

        .modal-content {
            background: #ffffff;
            width: 90%;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            border-radius: 8px;
            padding: 24px;
        }

        .modal-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #111827;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .modal-header .modal-title {
            margin-bottom: 0;
        }

        .modal-close-btn {
            background: none;
            border: none;
            font-size: 28px;
            color: #333;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            line-height: 1;
        }

        .modal-close-btn:hover {
            color: #000;
        }

        .template-item {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            margin-bottom: 12px;
        }

        .template-name {
            font-weight: 600;
            margin-bottom: 8px;
            color: #1f2937;
        }

        .template-code {
            background: #fff;
            color: #333;
            padding: 10px;
            border-radius: 4px;
            font-size: 11px;
            font-family: 'Courier New', monospace;
            overflow-x: auto;
            border: 1px solid #e5e7eb;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .template-actions {
            margin-top: 10px;
        }

        .btn-edit {
            padding: 6px 12px;
            background: #2196F3;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-right: 8px;
        }

        .btn-delete {
            padding: 6px 12px;
            background: #f44336;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .textarea {
            width: 100%;
            min-height: 150px;
            padding: 10px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            resize: vertical;
            background: #fff;
            color: #333;
        }

        .textarea:focus {
            outline: none;
            border-color: #4CAF50;
            box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
        }

        .modal-buttons {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }

        .btn-save {
            flex: 1;
            padding: 10px;
            background: #4CAF50;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
        }

        .btn-cancel {
            flex: 1;
            padding: 10px;
            background: #6b7280;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
        }

        /* Кнопка запуска */
        .trigger-button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 14px 24px;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(76, 175, 80, 0.4);
            z-index: 999998;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .trigger-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.5);
        }

        .trigger-button:active {
            transform: translateY(0);
        }

        .test-data-hint {
            margin-bottom: 16px;
            padding: 12px;
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 6px;
            font-size: 12px;
            color: #856404;
        }

        .test-data-hint strong {
            display: block;
            margin-bottom: 6px;
        }

        /* Стили для блока подзадач */
        .subtasks-section {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
            border: 1px solid #e0e0e0;
        }

        .subtasks-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .subtask-item {
            background: #ffffff;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            position: relative;
        }

        .subtask-item-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
        }

        .subtask-number {
            background: #4CAF50;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
        }

        .subtask-name-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
        }

        .subtask-name-input::placeholder {
            color: #999;
        }

        .subtask-delete-btn {
            background: #f44336;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }

        .subtask-delete-btn:hover {
            background: #d32f2f;
        }

        .subtask-fields {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .subtask-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .subtask-field-label {
            font-size: 12px;
            color: #666;
            font-weight: 500;
        }

        .subtask-field-full {
            grid-column: 1 / -1;
        }

        .subtask-select {
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            background: white;
            color: #333;
        }

        .subtask-allocation-input {
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            width: 80px;
            background: white;
            color: #333;
        }

        .add-subtask-btn {
            background: #2196F3;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
            margin-top: 10px;
        }

        .add-subtask-btn:hover {
            background: #1976D2;
        }

        /* Стили для кнопки типовых подзадач */
        .subtask-templates-btn {
            background: #9C27B0;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
            margin-top: 10px;
        }

        .subtask-templates-btn:hover {
            background: #7B1FA2;
        }

        .subtask-buttons-row {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }

        /* Стили для модального окна типовых подзадач */
        .templates-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000000;
        }

        .templates-modal-content {
            background: white;
            border-radius: 8px;
            padding: 24px;
            width: 90%;
            max-width: 700px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        /* v4.5.2: Секция закреплённых подзадач */
        .pinned-subtasks-section {
            background: #E8F5E9;
            border: 1px solid #A5D6A7;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
        }
        .pinned-subtasks-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-weight: 600;
            color: #2E7D32;
        }
        .pinned-subtasks-hint {
            font-size: 12px;
            font-weight: 400;
            color: #666;
        }
        .pinned-subtasks-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .pinned-subtasks-empty {
            color: #888;
            font-size: 13px;
            font-style: italic;
        }
        .pinned-subtask-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 13px;
        }
        .pinned-subtask-name {
            flex: 1;
            color: #333;
        }
        .pinned-subtask-dept {
            font-size: 11px;
            color: #888;
            background: #f0f0f0;
            padding: 2px 8px;
            border-radius: 10px;
        }
        .pinned-subtask-unpin {
            background: transparent;
            border: none;
            color: #999;
            cursor: pointer;
            font-size: 14px;
            padding: 2px 6px;
            border-radius: 4px;
            transition: all 0.15s;
        }
        .pinned-subtask-unpin:hover {
            background: #ffebee;
            color: #f44336;
        }

        .templates-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #e0e0e0;
        }

        .templates-modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
        }

        .templates-close-btn {
            background: transparent;
            border: none;
            font-size: 28px;
            color: #666;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background 0.2s;
        }

        .templates-close-btn:hover {
            background: #f0f0f0;
        }

        .templates-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
        }

        .templates-tab {
            background: transparent;
            border: none;
            padding: 10px 20px;
            font-size: 15px;
            font-weight: 500;
            color: #666;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            transition: all 0.2s;
        }

        .templates-tab:hover {
            color: #333;
            background: #f5f5f5;
        }

        .templates-tab.active {
            color: #9C27B0;
            border-bottom-color: #9C27B0;
        }

        .tab-badge {
            display: inline-block;
            background: #4CAF50;
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: 6px;
            min-width: 18px;
            text-align: center;
        }

        .templates-department-content {
            display: none;
        }

        .templates-department-content.active {
            display: block;
        }

        .template-item {
            background: #f8f9fa;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: border-color 0.2s;
        }

        .template-item:hover {
            border-color: #9C27B0;
        }

        .template-checkbox {
            width: 20px;
            height: 20px;
            cursor: pointer;
        }

        .template-item-info {
            flex: 1;
        }

        .template-item-name {
            font-size: 14px;
            font-weight: 500;
            color: #333;
            margin-bottom: 4px;
        }

        .template-item-meta {
            font-size: 12px;
            color: #666;
        }

        .template-item-actions {
            display: flex;
            gap: 8px;
        }

        .template-edit-btn,
        .template-delete-btn,
        .template-pin-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .template-pin-btn {
            background: #e0e0e0;
            color: #666;
        }
        .template-pin-btn:hover {
            background: #bdbdbd;
        }
        .template-pin-btn.pinned {
            background: #4CAF50;
            color: white;
        }
        .template-pin-btn.pinned:hover {
            background: #388E3C;
        }

        .template-edit-btn {
            background: #2196F3;
            color: white;
        }

        .template-edit-btn:hover {
            background: #1976D2;
        }

        .template-delete-btn {
            background: #f44336;
            color: white;
        }

        .template-delete-btn:hover {
            background: #d32f2f;
        }

        .template-add-form {
            background: #e3f2fd;
            border: 2px dashed #2196F3;
            border-radius: 6px;
            padding: 16px;
            margin-top: 16px;
        }

        .template-add-title {
            font-size: 15px;
            font-weight: 600;
            color: #333;
            margin-bottom: 12px;
        }

        .template-form-row {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 10px;
            margin-bottom: 12px;
        }

        .template-form-input,
        .template-form-select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
        }

        .template-form-buttons {
            display: flex;
            gap: 8px;
        }

        .template-save-btn,
        .template-cancel-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .template-save-btn {
            background: #4CAF50;
            color: white;
        }

        .template-save-btn:hover {
            background: #45a049;
        }

        .template-cancel-btn {
            background: #757575;
            color: white;
        }

        .template-cancel-btn:hover {
            background: #616161;
        }

        /* Стили для настроек Rocket.Chat */
        .rocket-settings-btn {
            background: #FF5722;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
            margin-top: 10px;
        }

        .rocket-settings-btn:hover {
            background: #E64A19;
        }

        .rocket-mapping-list {
            max-height: 400px;
            overflow-y: auto;
        }

        .rocket-mapping-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 6px;
            margin-bottom: 10px;
            border: 1px solid #e0e0e0;
        }

        .rocket-mapping-user {
            flex: 1;
            font-size: 14px;
            font-weight: 500;
            color: #333;
        }

        .rocket-mapping-arrow {
            color: #999;
            font-size: 18px;
        }

        .rocket-mapping-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
            font-family: 'Courier New', monospace;
        }

        .rocket-mapping-input::placeholder {
            color: #999;
        }

        .rocket-mapping-remove {
            background: #f44336;
            color: white;
            border: none;
            padding: 6px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
        }

        .rocket-mapping-remove:hover {
            background: #d32f2f;
        }

        .rocket-hint {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 16px;
            font-size: 13px;
            color: #856404;
        }

        .rocket-hint strong {
            display: block;
            margin-bottom: 4px;
        }

        .templates-modal-footer {
            margin-top: 20px;
            padding-top: 16px;
            border-top: 2px solid #e0e0e0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .templates-select-info {
            font-size: 14px;
            color: #666;
        }

        .templates-apply-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 4px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }

        .templates-apply-btn:hover {
            background: #45a049;
        }

        .templates-apply-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        /* Стили для управления отделами */
        .department-management {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding: 12px;
            background: #f0f0f0;
            border-radius: 6px;
        }

        .department-add-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            color: #333;
        }

        .department-add-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .department-add-btn:hover {
            background: #45a049;
        }

        .department-delete-btn {
            background: transparent;
            color: #999;
            border: none;
            padding: 2px 6px;
            border-radius: 50%;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.15s;
            margin-left: 4px;
        }

        .department-delete-btn:hover {
            background: #ffebee;
            color: #f44336;
        }

        .template-assignee-row {
            margin-top: 8px;
        }

        .template-assignee-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
            display: block;
        }

        .template-assignee-select {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            background: white;
            color: #333;
        }
    `;

    // ===== STORAGE ФУНКЦИИ =====
    function initializeStorage() {
        if (!GM_getValue('templates')) {
            GM_setValue('templates', JSON.stringify(DEFAULT_TEMPLATES));
        }
        if (!GM_getValue('subdomainHistory')) {
            GM_setValue('subdomainHistory', JSON.stringify({}));
        }
        if (!GM_getValue('domainDatabase')) {
            GM_setValue('domainDatabase', JSON.stringify({}));
        }
        // Инициализация кеша team members
        if (!GM_getValue('teamMembersCache')) {
            GM_setValue('teamMembersCache', JSON.stringify({ data: [], lastUpdated: null }));
        }
        // Инициализация кеша Rocket.Chat users
        if (!GM_getValue('rocketUsersCache')) {
            GM_setValue('rocketUsersCache', JSON.stringify({ data: [], lastUpdated: null }));
        }
        // Инициализация конфигурации отделов
        if (!GM_getValue('departmentsConfig')) {
            GM_setValue('departmentsConfig', JSON.stringify(DEFAULT_DEPARTMENTS));
        }
        // Инициализация конфигурации CMS
        if (!GM_getValue('cmsConfig')) {
            GM_setValue('cmsConfig', JSON.stringify(DEFAULT_CMS));
        }
    }

    // ===== ДЕФОЛТНЫЕ КОНФИГУРАЦИИ ОТДЕЛОВ И CMS =====
    const DEFAULT_DEPARTMENTS = {
        'AI.test': { projectGid: '1212745296715942', assigneeGid: '', rocketUsername: '@Timur_Head_Automation' },
        'EMD': { projectGid: '1212745296715942', assigneeGid: '', rocketUsername: '@Timur' },
        'SODA': { projectGid: '1212745296715942', assigneeGid: '', rocketUsername: '' },
        'Testlab': { projectGid: '1212745296715942', assigneeGid: '', rocketUsername: '' },
        'Flex': { projectGid: '1212745296715942', assigneeGid: '', rocketUsername: '' }
    };

    const DEFAULT_CMS = {
        'laravel': { name: 'Laravel', assigneeGid: '' },
        'wordpress': { name: 'WordPress', assigneeGid: '' },
        'static': { name: 'Статика', assigneeGid: '' }
    };

    // ===== ФУНКЦИИ ДЛЯ РАБОТЫ С КОНФИГУРАЦИЕЙ ОТДЕЛОВ =====
    function loadDepartmentsConfig() {
        return JSON.parse(GM_getValue('departmentsConfig', JSON.stringify(DEFAULT_DEPARTMENTS)));
    }

    function saveDepartmentsConfig(config) {
        GM_setValue('departmentsConfig', JSON.stringify(config));
    }

    function getDepartmentsList() {
        return Object.keys(loadDepartmentsConfig());
    }


    // ===== ФУНКЦИИ ДЛЯ РАБОТЫ С КОНФИГУРАЦИЕЙ CMS =====
    function loadCmsConfig() {
        return JSON.parse(GM_getValue('cmsConfig', JSON.stringify(DEFAULT_CMS)));
    }

    function saveCmsConfig(config) {
        GM_setValue('cmsConfig', JSON.stringify(config));
    }

    function getCmsList() {
        return Object.entries(loadCmsConfig()).map(([key, val]) => ({ key, name: val.name }));
    }


    // ===== ФУНКЦИИ ДЛЯ КЕШИРОВАНИЯ TEAM MEMBERS =====
    function loadTeamMembersFromCache() {
        const cache = JSON.parse(GM_getValue('teamMembersCache', '{"data":[],"lastUpdated":null}'));
        return cache;
    }

    function saveTeamMembersToCache(members) {
        const cache = {
            data: members,
            lastUpdated: new Date().toISOString()
        };
        GM_setValue('teamMembersCache', JSON.stringify(cache));
        if(DEBUG) console.log('✅ Team members сохранены в кеш:', members.length, 'пользователей');
    }

    function isTeamMembersCacheExpired() {
        const cache = loadTeamMembersFromCache();
        if (!cache.lastUpdated) return true;
        const lastUpdated = new Date(cache.lastUpdated);
        const now = new Date();
        // Кеш считается устаревшим через 1 час
        const hourInMs = 60 * 60 * 1000;
        return (now - lastUpdated) > hourInMs;
    }

    function fetchTeamMembersFromAPI() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://app.asana.com/api/1.0/workspaces/${CONFIG.asana.workspaceGid}/users`,
                headers: {
                    'Authorization': `Bearer ${CONFIG.asana.token}`
                },
                onload: (response) => {
                    if (response.status === 200) {
                        const result = JSON.parse(response.responseText);
                        saveTeamMembersToCache(result.data);
                        resolve(result.data);
                    } else {
                        reject(new Error('Failed to load team members from API'));
                    }
                },
                onerror: () => reject(new Error('Network error'))
            });
        });
    }

    // Фоновое обновление кеша
    function refreshTeamMembersCacheInBackground() {
        if(DEBUG) console.log('🔄 Фоновое обновление team members...');
        fetchTeamMembersFromAPI()
            .then(() => {
                if(DEBUG) console.log('✅ Фоновое обновление Asana завершено');
                // v4.3.7: Синхронизация маппинга после обновления
                syncAsanaRocketMapping();
            })
            .catch(err => console.warn('⚠️ Фоновое обновление Asana не удалось:', err.message));
    }

    // Фоновое обновление Rocket.Chat пользователей
    function refreshRocketUsersCacheInBackground() {
        if (!CONFIG.rocketChat.authToken || !CONFIG.rocketChat.userId) {
            if(DEBUG) console.log('⏭️ Rocket.Chat API не настроен, пропускаем обновление');
            return;
        }
        if(DEBUG) console.log('🔄 Фоновое обновление Rocket.Chat users...');
        fetchRocketUsersFromAPI()
            .then(() => {
                if(DEBUG) console.log('✅ Фоновое обновление Rocket.Chat завершено');
                // v4.3.7: Синхронизация маппинга после обновления
                syncAsanaRocketMapping();
            })
            .catch(err => console.warn('⚠️ Фоновое обновление Rocket.Chat не удалось:', err.message));
    }

    // ===== ФУНКЦИИ ДЛЯ КЕШИРОВАНИЯ ПРОЕКТОВ ASANA =====
    function loadProjectsFromCache() {
        const cache = JSON.parse(GM_getValue('projectsCache', '{"data":[],"lastUpdated":null}'));
        return cache;
    }

    function saveProjectsToCache(projects) {
        const cache = {
            data: projects,
            lastUpdated: new Date().toISOString()
        };
        GM_setValue('projectsCache', JSON.stringify(cache));
        if(DEBUG) console.log('✅ Проекты сохранены в кеш:', projects.length, 'проектов');
    }

    function isProjectsCacheExpired() {
        const cache = loadProjectsFromCache();
        if (!cache.lastUpdated) return true;
        const lastUpdated = new Date(cache.lastUpdated);
        const now = new Date();
        const hourInMs = 60 * 60 * 1000;
        return (now - lastUpdated) > hourInMs;
    }

    function fetchProjectsFromAPI() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://app.asana.com/api/1.0/workspaces/${CONFIG.asana.workspaceGid}/projects?opt_fields=name,gid&limit=100`,
                headers: {
                    'Authorization': `Bearer ${CONFIG.asana.token}`
                },
                onload: (response) => {
                    if (response.status === 200) {
                        const result = JSON.parse(response.responseText);
                        saveProjectsToCache(result.data);
                        resolve(result.data);
                    } else {
                        reject(new Error('Failed to load projects from API'));
                    }
                },
                onerror: () => reject(new Error('Network error'))
            });
        });
    }

    async function getProjects() {
        const cache = loadProjectsFromCache();
        if (cache.data && cache.data.length > 0) {
            if (isProjectsCacheExpired()) {
                fetchProjectsFromAPI().catch(err => console.warn('Фоновое обновление проектов не удалось:', err));
            }
            return cache.data;
        }
        return await fetchProjectsFromAPI();
    }

    // ===== ФУНКЦИИ ДЛЯ КЕШИРОВАНИЯ TEAMS ASANA =====
    function loadTeamsFromCache() {
        const cache = JSON.parse(GM_getValue('teamsCache', '{"data":[],"lastUpdated":null}'));
        return cache;
    }

    function saveTeamsToCache(teams) {
        const cache = {
            data: teams,
            lastUpdated: new Date().toISOString()
        };
        GM_setValue('teamsCache', JSON.stringify(cache));
        if(DEBUG) console.log('✅ Teams сохранены в кеш:', teams.length);
    }

    function fetchTeamsFromAPI() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://app.asana.com/api/1.0/workspaces/${CONFIG.asana.workspaceGid}/teams?opt_fields=name,gid&limit=100`,
                headers: {
                    'Authorization': `Bearer ${CONFIG.asana.token}`
                },
                onload: (response) => {
                    if (response.status === 200) {
                        const result = JSON.parse(response.responseText);
                        saveTeamsToCache(result.data);
                        resolve(result.data);
                    } else {
                        if(DEBUG) console.warn('Teams API вернул:', response.status);
                        resolve([]); // Не все workspaces имеют teams
                    }
                },
                onerror: () => resolve([]) // Не критичная ошибка
            });
        });
    }

    async function getTeams() {
        const cache = loadTeamsFromCache();
        if (cache.data && cache.data.length > 0) {
            return cache.data;
        }
        return await fetchTeamsFromAPI();
    }

    // Получить проекты для конкретной team
    function fetchProjectsByTeam(teamGid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://app.asana.com/api/1.0/teams/${teamGid}/projects?opt_fields=name,gid&limit=100`,
                headers: {
                    'Authorization': `Bearer ${CONFIG.asana.token}`
                },
                onload: (response) => {
                    if (response.status === 200) {
                        const result = JSON.parse(response.responseText);
                        resolve(result.data);
                    } else {
                        resolve([]);
                    }
                },
                onerror: () => resolve([])
            });
        });
    }

    function loadTemplates() {
        return JSON.parse(GM_getValue('templates', JSON.stringify(DEFAULT_TEMPLATES)));
    }

    function saveTemplates(templates) {
        GM_setValue('templates', JSON.stringify(templates));
    }

    // ===== ФУНКЦИИ ДЛЯ РАБОТЫ С WWW =====
    function hasWww(subdomain) {
        return subdomain.toLowerCase().startsWith('www.');
    }


    function removeWww(subdomain) {
        if (!hasWww(subdomain)) return subdomain;
        return subdomain.replace(/^www\./i, '');
    }

    // ===== ФУНКЦИИ НОРМАЛИЗАЦИИ ДОМЕНА (www, http, https) =====
    function normalizeDomain(input) {
        if (!input) return '';
        // Убираем протокол и www
        let domain = input.toLowerCase().trim()
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/\/.*$/, ''); // Убираем путь
        return domain;
    }

    // v4.6.10: Парсинг oldUrl с разделением по типам (301/404)
    // Формат хранения: url|type на каждой строке
    function parseOldUrls(oldUrlField) {
        const result = { urls301: [], urls404: [], all: [] };
        if (!oldUrlField) return result;
        
        const lines = oldUrlField.split('\n').filter(line => line.trim());
        for (const line of lines) {
            const parts = line.split('|');
            const url = parts[0].trim();
            const type = (parts[1] || '404').trim();
            
            if (url) {
                result.all.push(url);
                if (type === '301') {
                    result.urls301.push(url);
                } else {
                    result.urls404.push(url);
                }
            }
        }
        return result;
    }

    // v4.6.10: Форматирование oldUrl для отображения (без типов)
    function formatOldUrlForDisplay(oldUrlField) {
        const parsed = parseOldUrls(oldUrlField);
        return parsed.all.join('\n');
    }

    // v4.6.14: Форматирование oldUrl для ТЗ (с разделением по типам)
    function formatOldUrlForTZ(oldUrlField) {
        const parsed = parseOldUrls(oldUrlField);
        const sections = [];
        
        if (parsed.urls404.length > 0) {
            sections.push('Отдать 404 для страниц:\n' + parsed.urls404.join('\n'));
        }
        
        if (parsed.urls301.length > 0) {
            sections.push('Снести 301 редирект для страниц:\n' + parsed.urls301.join('\n'));
        }
        
        return sections.join('\n\n');
    }

    // v4.6.17: Форматирование AMP для ТЗ
    function formatAmpText(ampValue, domain, newSub) {
        if (!ampValue) return '';
        const labels = {
            'domain': `https://${domain || '{{domain}}'}/`,
            'subdomain': `https://${newSub || '{{newSub}}'}/`,
            'both': `https://${domain || '{{domain}}'}/ и https://${newSub || '{{newSub}}'}/`
        };
        return labels[ampValue] ? `Амп ставим на: ${labels[ampValue]}` : '';
    }

    function getDomainVariants(domain) {
        const normalized = normalizeDomain(domain);
        if (!normalized) return [];
        return [
            normalized,
            'www.' + normalized,
            'http://' + normalized,
            'https://' + normalized,
            'http://www.' + normalized,
            'https://www.' + normalized
        ];
    }

    // ===== УТИЛИТЫ ДЛЯ РАБОТЫ С ПОДДОМЕНАМИ =====
    // LEGACY CODE REMOVED:
    // - subdomainHistory functions (getSubdomainHistory, addToHistory, loadSubdomainHistory, etc.)
    // - domainDatabase functions (loadDomainDatabase, saveDomainDatabase, etc.)
    // All replaced by sitesDatabase. Migration handled by migrateLegacyToSites()

    // ===== ЕДИНАЯ БАЗА САЙТОВ (sitesDatabase) =====

    function loadSitesDatabase() {
        return JSON.parse(GM_getValue('sitesDatabase', '{}'));
    }

    function saveSitesDatabase(database) {
        GM_setValue('sitesDatabase', JSON.stringify(database));
    }

    // ===== ИСТОРИЯ АВТОМАТИЗАЦИЙ =====

    function loadAutomationHistory() {
        return JSON.parse(GM_getValue('automationHistory', '[]'));
    }

    function saveAutomationHistory(history) {
        GM_setValue('automationHistory', JSON.stringify(history));
    }

    function addToAutomationHistory(record) {
        const history = loadAutomationHistory();
        const newRecord = {
            id: Date.now(),
            date: new Date().toISOString(),
            ...record
        };
        history.unshift(newRecord); // Новые записи в начало
        // Ограничиваем 1000 записей
        if (history.length > 1000) history.length = 1000;
        saveAutomationHistory(history);
        return newRecord;
    }

    function clearAutomationHistory() {
        saveAutomationHistory([]);
    }

    function exportAutomationHistory() {
        const history = loadAutomationHistory();
        return JSON.stringify(history, null, 2);
    }

    // ===== ИСТОРИЯ ЛОКАЛЬНЫХ ТЗ (Excel) =====

    function loadLocalTzHistory() {
        return JSON.parse(GM_getValue('localTzHistory', '[]'));
    }

    function saveLocalTzHistory(history) {
        GM_setValue('localTzHistory', JSON.stringify(history));
    }

    function addToLocalTzHistory(record) {
        const history = loadLocalTzHistory();
        const newRecord = {
            id: Date.now(),
            date: new Date().toISOString(),
            ...record
        };
        history.unshift(newRecord);
        if (history.length > 1000) history.length = 1000;
        saveLocalTzHistory(history);
        return newRecord;
    }

    function clearLocalTzHistory() {
        saveLocalTzHistory([]);
    }

    // ===== ИСТОРИЯ ОБЛАЧНЫХ ТЗ (Google Sheets) =====

    function loadCloudTzHistory() {
        return JSON.parse(GM_getValue('cloudTzHistory', '[]'));
    }

    function saveCloudTzHistory(history) {
        GM_setValue('cloudTzHistory', JSON.stringify(history));
    }

    function addToCloudTzHistory(record) {
        const history = loadCloudTzHistory();
        const newRecord = {
            id: Date.now(),
            date: new Date().toISOString(),
            ...record
        };
        history.unshift(newRecord);
        if (history.length > 1000) history.length = 1000;
        saveCloudTzHistory(history);
        return newRecord;
    }

    function clearCloudTzHistory() {
        saveCloudTzHistory([]);
    }

    // Миграция из старых форматов при первом запуске
    function migrateLegacyToSites() {
        const sitesDb = loadSitesDatabase();
        if (Object.keys(sitesDb).length > 0) return; // уже есть данные

        const domainDb = JSON.parse(GM_getValue('domainDatabase', '{}'));
        const historyDb = JSON.parse(GM_getValue('subdomainHistory', '{}'));
        const newDb = {};

        for (const domain in domainDb) {
            newDb[domain] = {
                department: domainDb[domain].department || '',
                cms: domainDb[domain].cms || '',
                status: domainDb[domain].status || 'active',
                hasAMP: false,
                dmcaDefault: false,
                hreflangTemplate: '',
                oldSubdomains: [],
                currentSubdomain: '',
                assigneeGid: '',
                projectGid: '',
                owner: '',
                addedDate: domainDb[domain].addedDate || new Date().toISOString().split('T')[0],
                lastTaskDate: '',
                notes: domainDb[domain].notes || ''
            };
        }

        for (const domain in historyDb) {
            if (!newDb[domain]) {
                newDb[domain] = {
                    department: '', cms: '', status: 'active', hasAMP: false, dmcaDefault: false,
                    hreflangTemplate: '', oldSubdomains: [], currentSubdomain: '',
                    assigneeGid: '', projectGid: '', owner: '',
                    addedDate: new Date().toISOString().split('T')[0], lastTaskDate: '', notes: '',
                    alternateDomain: '', toUrl: '', oldUrl: ''
                };
            }
            newDb[domain].oldSubdomains = historyDb[domain].map(url => ({ url, action: '301', usedDate: '' }));
        }

        if (Object.keys(newDb).length > 0) {
            saveSitesDatabase(newDb);
            if(DEBUG) console.log('✅ Миграция в sitesDatabase завершена');
        }
    }
    migrateLegacyToSites();

    // v4.3.6: Миграция шаблонов подзадач - установка allocation на 1%
    function migrateSubtaskTemplatesAllocation() {
        const saved = GM_getValue('subtaskTemplates');
        if (!saved) return; // Нет сохранённых шаблонов

        try {
            const templates = JSON.parse(saved);
            let migrated = false;

            for (const dept in templates) {
                templates[dept].forEach(template => {
                    if (template.allocation > 10) {
                        template.allocation = 1;
                        migrated = true;
                    }
                });
            }

            if (migrated) {
                GM_setValue('subtaskTemplates', JSON.stringify(templates));
                if(DEBUG) console.log('✅ Миграция шаблонов подзадач: allocation изменён на 1%');
            }
        } catch (e) {
            console.error('Ошибка миграции шаблонов:', e);
        }
    }
    migrateSubtaskTemplatesAllocation();

    function getSite(domain) {
        const db = loadSitesDatabase();
        return db[domain] || null;
    }

    function addSite(domain, data) {
        const db = loadSitesDatabase();
        db[domain] = {
            department: data.department || '',
            cms: data.cms || '',
            status: data.status || 'active',
            hasAMP: data.hasAMP || false,
            dmcaDefault: data.dmcaDefault || false,
            hreflangTemplate: data.hreflangTemplate || '',
            oldSubdomains: data.oldSubdomains || [],
            currentSubdomain: data.currentSubdomain || '',
            assigneeGid: data.assigneeGid || '',
            projectGid: data.projectGid || '',
            owner: data.owner || '',
            addedDate: data.addedDate || new Date().toISOString().split('T')[0],
            lastTaskDate: data.lastTaskDate || '',
            notes: data.notes || '',
            // v4.6.17: Добавлены новые поля
            alternateDomain: data.alternateDomain || '',
            toUrl: data.toUrl || '',
            oldUrl: data.oldUrl || ''
        };
        saveSitesDatabase(db);
    }

    // v4.2.0: Универсальная валидация с базой
    // v4.2.1: Валидация с проверкой www И протокола
    function validateWithDatabase(type, domain, value, db = null) {
        if (!value) return { status: 'empty' };

        // v4.5.2 PERF: Используем переданную базу или загружаем
        if (!db) db = loadSitesDatabase();
        const normalizedDomain = normalizeDomain(domain);

        // Хелперы для проверки www и протокола
        const getProtocol = (url) => {
            if (url.toLowerCase().startsWith('https://')) return 'https';
            if (url.toLowerCase().startsWith('http://')) return 'http';
            return '';
        };
        const hasWww = (url) => {
            return url.toLowerCase().replace(/^https?:\/\//, '').startsWith('www.');
        };

        // Находим сайт в базе
        let site = null;
        for (const d in db) {
            if (db[d].status === 'active' && normalizeDomain(d) === normalizedDomain) {
                site = db[d];
                break;
            }
        }
        if (!site && db[domain] && db[domain].status === 'active') {
            site = db[domain];
        }

        const normalizedValue = normalizeDomain(value);
        const valueProtocol = getProtocol(value);
        const valueHasWww = hasWww(value);

        // Функция сравнения URL
        const compareUrls = (dbUrl) => {
            const dbProtocol = getProtocol(dbUrl);
            const dbHasWww = hasWww(dbUrl);

            const issues = [];
            if (valueProtocol && dbProtocol && valueProtocol !== dbProtocol) {
                issues.push('протокол: ' + dbProtocol + ' → ' + valueProtocol);
            }
            if (valueHasWww !== dbHasWww) {
                issues.push('www: ' + (dbHasWww ? 'с www' : 'без www') + ' → ' + (valueHasWww ? 'с www' : 'без www'));
            }

            return {
                match: issues.length === 0,
                issues: issues,
                message: issues.length > 0 ? 'В базе: ' + dbUrl + ' (' + issues.join(', ') + ')' : ''
            };
        };

        if (type === 'domain') {
            if(DEBUG) console.log('🔎 validateWithDatabase DOMAIN:', value, '→ normalized:', normalizedValue);
            for (const d in db) {
                if (db[d].status !== 'active') continue;
                const dbNormalized = normalizeDomain(d);
                if(DEBUG) console.log(`   Сравнение: "${dbNormalized}" === "${normalizedValue}" ?`, dbNormalized === normalizedValue);
                if (dbNormalized === normalizedValue) {
                    const cmp = compareUrls(d);
                    if (!cmp.match) {
                        if(DEBUG) console.log('   → www-mismatch');
                        return { status: 'www-mismatch', dbValue: d, message: cmp.message };
                    }
                    if(DEBUG) console.log('   → valid');
                    return { status: 'valid', dbValue: d };
                }
            }
            if(DEBUG) console.log('   → not-found');
            return { status: 'not-found', message: 'Домен не найден в базе' };
        }

        if (type === 'oldSub') {
            if (!site || !site.oldSubdomains || site.oldSubdomains.length === 0) {
                return { status: 'not-found', message: 'Нет истории поддоменов' };
            }

            for (const s of site.oldSubdomains) {
                if (normalizeDomain(s.url) === normalizedValue) {
                    const cmp = compareUrls(s.url);
                    if (!cmp.match) {
                        return { status: 'www-mismatch', dbValue: s.url, action: s.action, message: cmp.message };
                    }
                    return { status: 'valid', dbValue: s.url, action: s.action };
                }
            }
            return { status: 'not-found', message: 'Поддомен не найден в истории' };
        }

        if (type === 'newSub') {
            // v4.5.6: Новый поддомен НЕ проверяем в базе - его там ещё нет
            // Просто проверяем что это валидный формат поддомена
            if (value && value.includes('.')) {
                return { status: 'valid' };
            }
            return { status: 'unknown' };
        }

        return { status: 'unknown' };
    }

    // v4.2.0: Применить стиль к input
    function applyInputStyle(input, validation, isRequired) {
        // Убираем старые классы
        input.classList.remove('input-valid', 'input-error');

        // Убираем старый tooltip
        const oldTooltip = input.parentElement.querySelector('.input-warning-tooltip');
        if (oldTooltip) oldTooltip.remove();

        if (validation.status === 'valid') {
            input.classList.add('input-valid');
        } else if (validation.status === 'www-mismatch') {
            input.classList.add('input-error');
            // Показываем tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'input-warning-tooltip';
            tooltip.textContent = validation.message;
            input.parentElement.style.position = 'relative';
            input.parentElement.appendChild(tooltip);
        } else if (validation.status === 'not-found' && isRequired) {
            input.classList.add('input-error');
        }
        // status: 'new' или 'empty' - обычная рамка
    }

    // FIX v4.1.9: Обновление базы после создания задачи
    function updateSiteAfterTask(domain, data) {
        const db = loadSitesDatabase();
        const normalized = normalizeDomain(domain);

        // Ищем домен в базе (с учётом www)
        let targetDomain = null;
        if (db[domain]) {
            targetDomain = domain;
        } else {
            for (const d in db) {
                if (normalizeDomain(d) === normalized) {
                    targetDomain = d;
                    break;
                }
            }
        }

        // v4.6.17: Если домена нет в базе - создаём его
        if (!targetDomain && domain) {
            targetDomain = domain;
            db[targetDomain] = {
                department: data.department || '',
                cms: data.cms || '',
                status: 'active',
                hasAMP: data.hasAMP || false,
                dmcaDefault: data.dmcaDefault || false,
                hreflangTemplate: '',
                oldSubdomains: [],
                currentSubdomain: '',
                assigneeGid: '',
                projectGid: '',
                owner: '',
                addedDate: new Date().toISOString().split('T')[0],
                lastTaskDate: '',
                notes: '',
                alternateDomain: '',
                toUrl: '',
                oldUrl: ''
            };
            if(DEBUG) console.log('📝 Домен автоматически добавлен в базу:', targetDomain);
        }

        if (targetDomain && db[targetDomain]) {
            // Основной домен: отдел, CMS, флаги
            if (data.department) db[targetDomain].department = data.department;
            if (data.cms) db[targetDomain].cms = data.cms;
            if (data.hasAMP !== undefined) db[targetDomain].hasAMP = data.hasAMP;
            if (data.dmcaDefault !== undefined) db[targetDomain].dmcaDefault = data.dmcaDefault;

            // Новый поддомен: currentSubdomain, отдел, дата последней задачи
            if (data.currentSubdomain) db[targetDomain].currentSubdomain = data.currentSubdomain;
            if (data.lastTaskDate) db[targetDomain].lastTaskDate = data.lastTaskDate;

            // v4.6.17: Сохраняем alternateDomain, toUrl, oldUrl
            if (data.alternateDomain) db[targetDomain].alternateDomain = data.alternateDomain;
            if (data.toUrl) db[targetDomain].toUrl = data.toUrl;
            if (data.oldUrl) db[targetDomain].oldUrl = data.oldUrl;

            // Старый поддомен: добавляем/обновляем в oldSubdomains с action
            if (data.oldSubdomain) {
                // v4.6.17: Инициализация массива если его нет
                if (!db[targetDomain].oldSubdomains) {
                    db[targetDomain].oldSubdomains = [];
                }
                
                const existingIdx = db[targetDomain].oldSubdomains.findIndex(s =>
                    normalizeDomain(s.url) === normalizeDomain(data.oldSubdomain)
                );

                const action = data.redirect301 ? '301' : (data.redirect404 ? '404' : '301');
                const usedDate = new Date().toISOString().split('T')[0];

                if (existingIdx >= 0) {
                    // Обновляем существующую запись
                    db[targetDomain].oldSubdomains[existingIdx].action = action;
                    db[targetDomain].oldSubdomains[existingIdx].usedDate = usedDate;
                } else {
                    // Добавляем новую запись
                    db[targetDomain].oldSubdomains.push({
                        url: data.oldSubdomain,
                        action: action,
                        usedDate: usedDate
                    });
                }
            }

            saveSitesDatabase(db);
            if(DEBUG) console.log('📝 База обновлена для домена:', targetDomain);
        }
    }

    function updateSite(domain, data) {
        const db = loadSitesDatabase();
        if (db[domain]) {
            db[domain] = { ...db[domain], ...data };
            saveSitesDatabase(db);
        }
    }

    function removeSite(domain) {
        const db = loadSitesDatabase();
        delete db[domain];
        saveSitesDatabase(db);
    }


    function removeSubdomainFromSite(domain, subdomainUrl) {
        const db = loadSitesDatabase();
        if (db[domain] && db[domain].oldSubdomains) {
            db[domain].oldSubdomains = db[domain].oldSubdomains.filter(s => s.url !== subdomainUrl);
            saveSitesDatabase(db);
        }
    }

    // v4.3.5: Добавление старого поддомена в базу
    function addOldSubdomainToSite(domain, subdomainUrl, action = '301', usedDate = '') {
        const db = loadSitesDatabase();

        // Если домена нет в базе - создаём
        if (!db[domain]) {
            db[domain] = {
                status: 'active',
                department: '',
                cms: '',
                hasAMP: false,
                dmcaDefault: false,
                hreflangTemplate: '',
                oldSubdomains: [],
                currentSubdomain: '',
                addedDate: new Date().toISOString().split('T')[0],
                // v4.6.17: Новые поля
                alternateDomain: '',
                toUrl: '',
                oldUrl: ''
            };
        }

        if (!db[domain].oldSubdomains) {
            db[domain].oldSubdomains = [];
        }

        // Проверяем существует ли уже такой поддомен
        const existingIdx = db[domain].oldSubdomains.findIndex(s =>
            normalizeDomain(s.url) === normalizeDomain(subdomainUrl)
        );

        const newEntry = {
            url: subdomainUrl,
            action: action,
            usedDate: usedDate || new Date().toISOString().split('T')[0]
        };

        if (existingIdx >= 0) {
            // Обновляем существующую запись
            db[domain].oldSubdomains[existingIdx] = newEntry;
        } else {
            // Добавляем новую запись
            db[domain].oldSubdomains.push(newEntry);
        }

        saveSitesDatabase(db);
    }

    function searchSites(query, departmentFilter = '') {
        const db = loadSitesDatabase();
        const results = [];
        const lowerQuery = (query || '').toLowerCase();

        for (const domain in db) {
            const site = db[domain];
            if (site.status !== 'active') continue;
            if (departmentFilter && site.department !== departmentFilter) continue;
            if (query && !domain.toLowerCase().includes(lowerQuery)) continue;
            results.push({ domain, ...site });
        }
        return results.sort((a, b) => a.domain.localeCompare(b.domain));
    }


    function getSitesStats() {
        const db = loadSitesDatabase();
        const sites = Object.values(db);
        const activeSites = sites.filter(s => s.status === 'active');
        const totalSubdomains = sites.reduce((sum, s) => sum + (s.oldSubdomains?.length || 0), 0);
        return {
            totalSites: sites.length,
            activeSites: activeSites.length,
            totalSubdomains,
            avgSubdomainsPerSite: sites.length > 0 ? (totalSubdomains / sites.length).toFixed(1) : 0
        };
    }




    // Импорт из XLSX с 3 листами
    function importSitesFromXLSX(arrayBuffer, mode = 'merge') {
        try {
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const db = mode === 'replace' ? {} : loadSitesDatabase();

            // Лист 1: Основной домен
            const sheet1Name = workbook.SheetNames[0];
            if (sheet1Name) {
                const sheet1 = workbook.Sheets[sheet1Name];
                const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 });

                if (data1.length > 1) { // FIX: минимум заголовок + 1 строка данных
                    const headers = data1[0].map(h => String(h || '').trim().toLowerCase());
                    const domainIdx = headers.indexOf('domain');

                    if (domainIdx !== -1) {
                        for (let i = 1; i < data1.length; i++) { // FIX: начинаем со 2-й строки (данные)
                            const row = data1[i];
                            if (!row || !row[domainIdx]) continue;

                            const domain = String(row[domainIdx]).trim();
                            if (!domain) continue;

                            const getVal = (field) => {
                                const idx = headers.indexOf(field.toLowerCase());
                                return idx !== -1 && row[idx] ? String(row[idx]).trim() : '';
                            };

                            db[domain] = {
                                department: getVal('department'),
                                cms: getVal('cms'),
                                status: getVal('status') || 'active',
                                hasAMP: getVal('hasamp') === 'true',
                                dmcaDefault: getVal('dmcadefault') === 'true',
                                hreflangTemplate: getVal('hreflangtemplate'),
                                oldSubdomains: db[domain]?.oldSubdomains || [],
                                currentSubdomain: db[domain]?.currentSubdomain || '',
                                assigneeGid: getVal('assigneegid') || '',
                                projectGid: getVal('projectgid') || '',
                                owner: getVal('owner') || '',
                                addedDate: getVal('addeddate') || new Date().toISOString().split('T')[0],
                                lastTaskDate: getVal('lasttaskdate') || '',
                                notes: getVal('notes'),
                                // v4.6.17: Новые поля
                                alternateDomain: getVal('alternatedomain') || '',
                                toUrl: getVal('tourl') || '',
                                oldUrl: getVal('oldurl') || ''
                            };
                        }
                    }
                }
            }

            // Лист 2: Старый поддомен
            const sheet2Name = workbook.SheetNames[1];
            if (sheet2Name) {
                const sheet2 = workbook.Sheets[sheet2Name];
                const data2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });

                if (data2.length > 1) { // FIX: минимум заголовок + 1 строка данных
                    const headers = data2[0].map(h => String(h || '').trim().toLowerCase());
                    const domainIdx = headers.indexOf('domain');
                    const subdomainIdx = headers.indexOf('subdomain');
                    const actionIdx = headers.indexOf('action');
                    const dateIdx = headers.indexOf('useddate');

                    if (domainIdx !== -1 && subdomainIdx !== -1) {
                        for (let i = 1; i < data2.length; i++) { // FIX: начинаем со 2-й строки
                            const row = data2[i];
                            if (!row || !row[domainIdx] || !row[subdomainIdx]) continue;

                            const domain = String(row[domainIdx]).trim();
                            const subdomain = String(row[subdomainIdx]).trim();
                            if (!domain || !subdomain) continue;

                            if (!db[domain]) {
                                db[domain] = {
                                    department: '', cms: '', status: 'active', hasAMP: false, dmcaDefault: false,
                                    hreflangTemplate: '', oldSubdomains: [], currentSubdomain: '',
                                    assigneeGid: '', projectGid: '', owner: '',
                                    addedDate: new Date().toISOString().split('T')[0], lastTaskDate: '', notes: '',
                                    alternateDomain: '', toUrl: '', oldUrl: ''
                                };
                            }

                            const exists = db[domain].oldSubdomains.some(s => s.url === subdomain);
                            if (!exists) {
                                db[domain].oldSubdomains.push({
                                    url: subdomain,
                                    action: actionIdx !== -1 && row[actionIdx] ? String(row[actionIdx]).trim() : '301',
                                    usedDate: dateIdx !== -1 && row[dateIdx] ? String(row[dateIdx]).trim() : ''
                                });
                            }
                        }
                    }
                }
            }

            // Лист 3: Новый поддомен (опционально - для currentSubdomain и переопределений)
            const sheet3Name = workbook.SheetNames[2];
            if (sheet3Name) {
                const sheet3 = workbook.Sheets[sheet3Name];
                const data3 = XLSX.utils.sheet_to_json(sheet3, { header: 1 });

                if (data3.length > 1) { // FIX: минимум заголовок + 1 строка данных
                    const headers = data3[0].map(h => String(h || '').trim().toLowerCase());
                    const domainIdx = headers.indexOf('domain');
                    const newSubIdx = headers.indexOf('newsubdomain');
                    const assigneeIdx = headers.indexOf('assigneegid');
                    const projectIdx = headers.indexOf('projectgid');

                    if (domainIdx !== -1) {
                        for (let i = 1; i < data3.length; i++) { // FIX: начинаем со 2-й строки
                            const row = data3[i];
                            if (!row || !row[domainIdx]) continue;

                            const domain = String(row[domainIdx]).trim();
                            if (!domain || !db[domain]) continue;

                            if (newSubIdx !== -1 && row[newSubIdx]) {
                                db[domain].currentSubdomain = String(row[newSubIdx]).trim();
                            }
                            if (assigneeIdx !== -1 && row[assigneeIdx]) {
                                db[domain].assigneeGid = String(row[assigneeIdx]).trim();
                            }
                            if (projectIdx !== -1 && row[projectIdx]) {
                                db[domain].projectGid = String(row[projectIdx]).trim();
                            }
                        }
                    }
                }
            }

            saveSitesDatabase(db);
            return true;
        } catch (e) {
            console.error('XLSX Import error:', e);
            return false;
        }
    }


    // ===== КЛАСС ДЛЯ УПРАВЛЕНИЯ UI =====
    class SubdomainDashboard {
        constructor() {
            this.shadowHost = null;
            this.shadowRoot = null;
            this.isDragging = false;
            this.currentX = 0;
            this.currentY = 0;
            this.initialX = 0;
            this.initialY = 0;
            this.subtasks = []; // Массив для хранения подзадач
            this.teamMembers = null; // Кеш списка пользователей
            this.subtaskIdCounter = 1; // Счётчик для уникальных ID подзадач
            this.currentDomain = ''; // Текущий выбранный домен для истории
            this.selectedDomains = []; // Массив выбранных доменов для массового создания
            // v4.0 - Массовый режим
            this.currentMode = 'mass'; // 'single' или 'mass' (v4.5.1: по умолчанию mass)
            this.tasks = []; // Массив задач для массового режима
            this.taskIdCounter = 1; // Счётчик ID задач
            // v4.5.5 - Фоновый режим
            this.isProcessing = false; // Флаг активной операции
        }

        create() {
            if(PROFILE) console.time('Dashboard.create');
            this.shadowHost = document.createElement('div');
            this.shadowHost.id = 'subdomain-automation-shadow-host';
            document.body.appendChild(this.shadowHost);

            this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

            // v4.3.7: Блокируем всплытие событий клавиатуры
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES;
            this.shadowRoot.appendChild(styleSheet);

            const container = document.createElement('div');
            container.className = 'dashboard-container mass-mode'; // v4.5.1: всегда mass-mode
            container.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(container);

            this.attachEventListeners();
            this.populateTemplateSelect();
            this.populateDepartmentSelect();
            this.populateCmsSelect();
            // makeDraggable убран - окно фиксированное
            this.renderSubtasks(); // Инициализируем пустой контейнер подзадач
            this.renderTasksTable(); // v4.5.1: сразу рендерим таблицу задач
            if(PROFILE) console.timeEnd('Dashboard.create');
        }

        getHTML() {
            return `
                <div class="dashboard-header" id="dashboard-header">
                    <h2 class="dashboard-title" id="dashboard-title">🔧 Смена поддоменов v4.0</h2>
                    <button class="close-btn" id="close-dashboard">&times;</button>
                </div>
                <div class="dashboard-content">
                    <!-- Переключатель режимов (v4.5.1: скрыт - только TЗ режим) -->
                    <div class="mode-switcher" style="display:none;">
                        <button class="mode-btn ${this.currentMode === 'single' ? 'active' : ''}" data-mode="single" id="mode-btn-single">
                            📝 Одиночный режим
                        </button>
                        <button class="mode-btn ${this.currentMode === 'mass' ? 'active' : ''}" data-mode="mass" id="mode-btn-mass">
                            📊 Массовый режим
                        </button>
                    </div>

                    <!-- Контейнер одиночного режима (v4.5.1: скрыт) -->
                    <div id="single-mode-container" class="mode-container ${this.currentMode === 'single' ? 'active' : ''}" style="display:none !important;">
                        ${this.getSingleModeHTML()}
                    </div>

                    <!-- Контейнер массового режима -->
                    <div id="mass-mode-container" class="mode-container ${this.currentMode === 'mass' ? 'active' : ''}">
                        ${this.getMassModeHTML()}
                    </div>

                    <!-- Общий лог выполнения -->
                    <div class="status-log" id="status-log" style="display: none;">
                        <div class="log-header">
                            <div class="log-title">Лог выполнения:</div>
                            <button class="log-copy-btn" id="copy-log-btn" title="Копировать лог">📋 Копировать</button>
                        </div>
                        <div class="log-content" id="log-content"></div>
                    </div>
                </div>
                
                <!-- v4.5.5: Глобальный прогресс-бар закреплён внизу -->
                <div class="global-progress" id="global-progress" style="display: none;">
                    <div class="global-progress-bar" id="global-progress-bar"></div>
                    <div class="global-progress-text" id="global-progress-text">0%</div>
                </div>
            `;
        }

        getSingleModeHTML() {
            return `
                <div class="single-mode-content">
                    <div class="test-data-hint">
                        <strong>🧪 ТЕСТОВЫЙ РЕЖИМ v2.8</strong>
                        Все данные настроены на проект AI.test<br>
                        Custom Fields: Priority + Percent Allocation<br>
                        Rocket.Chat: @Timur_Head_Automation<br>
                        <strong>NEW:</strong> Все настройки и тесты в одном окне!
                    </div>

                    <div class="form-group">
                        <label class="form-label">Задача *</label>
                        <input type="text" class="form-input" id="taskName" placeholder="Смена поддомена" value="Смена поддомена" />
                    </div>

                    <div class="form-group">
                        <label class="form-label">Отдел *</label>
                        <select class="form-select" id="department">
                            <option value="">Выберите отдел</option>
                            <option value="AI.test">AI.test (тест)</option>
                            <option value="EMD">EMD</option>
                            <option value="SODA">SODA</option>
                            <option value="Testlab">Testlab</option>
                            <option value="Flex">Flex</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Основной домен *</label>
                        <div class="input-with-settings">
                            <div class="domain-input-wrapper" style="flex: 1;">
                                <input type="text" class="form-input" id="domain" placeholder="example.com" autocomplete="off" />

                                <div class="autocomplete-list" id="domain-autocomplete"></div>
                            </div>
                            <span class="settings-icon-btn" id="manage-domains-unified" title="Управление доменами">🗂️</span>
                        </div>
                        <div class="selected-domains-container" id="selected-domains-container" style="display: none;">
                            <div class="selected-domains-header">
                                <span class="selected-domains-title">Выбранные домены:</span>
                                <button class="selected-domains-clear" id="clear-selected-domains">Очистить всё</button>
                            </div>
                            <div class="selected-domains-list" id="selected-domains-list"></div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Старый поддомен</label>
                        <div class="input-with-settings" style="position: relative;">
                            <input type="text" class="form-input" id="oldSub" placeholder="old.example.com" style="flex: 1;" autocomplete="off" />
                            <span class="settings-icon-btn" id="manage-history" title="Управление историей поддоменов">📜</span>
                            <div class="autocomplete-list" id="oldSub-autocomplete"></div>
                        </div>
                        <div class="checkbox-group" style="margin-top: 8px;">
                            <label class="checkbox-label">
                                <input type="checkbox" class="checkbox-input" id="redirect301" />
                                <span>301 редирект на главную</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" class="checkbox-input" id="redirect404" />
                                <span>404 ошибка на старый поддомен</span>
                            </label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Новый поддомен *</label>
                        <div class="input-with-settings" style="position: relative;">
                            <input type="text" class="form-input" id="newSub" placeholder="new.example.com" style="flex: 1;" autocomplete="off" />
                            <div class="autocomplete-list" id="newSub-autocomplete"></div>
                        </div>
                    </div>
                        <div class="www-hint" id="www-hint" style="display: none;">
                            <span class="www-hint-icon">⚠️</span>
                            <span class="www-hint-text">Проверьте наличие www - это критично!</span>
                        </div>
                        <div class="www-comparison" id="www-comparison" style="display: none;"></div>
                    </div>

                    <!-- v4.5.7: Новые поля -->
                    <div class="form-group">
                        <label class="form-label">URL дропа (301/404)</label>
                        <input type="text" class="form-input" id="toUrl" placeholder="https://drop.example.com/" autocomplete="off" />
                    </div>

                    <div class="form-group">
                        <label class="form-label">URL для 404 (несколько - по строкам)</label>
                        <div class="input-with-settings" style="position: relative;">
                            <textarea class="form-input form-textarea" id="oldUrl" placeholder="https://site.com/page1/&#10;https://site.com/page2/" rows="3" style="flex: 1; resize: vertical;"></textarea>
                            <span class="settings-icon-btn" id="manage-oldurl" title="Управление URL для 404">📜</span>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Домен подмены</label>
                        <input type="text" class="form-input" id="alternateDomain" placeholder="alternate-domain.com" autocomplete="off" />
                    </div>

                    <div class="form-group">
                        <label class="form-label">Шаблон hreflang *</label>
                        <div class="input-with-settings">
                            <select class="form-select" id="templateSelect" style="flex: 1;"></select>
                            <span class="settings-icon-btn" id="manage-templates" title="Управление шаблонами hreflang">🏷️</span>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Приоритет *</label>
                        <select class="form-select" id="priority">
                            <option value="">Выберите приоритет</option>
                            <option value="high">High + Ping Rocket Chat</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">CMS сайта</label>
                        <select class="form-select" id="cms">
                            <option value="">Не выбрано</option>
                            <option value="laravel">Laravel</option>
                            <option value="wordpress">WordPress</option>
                            <option value="static">Статика</option>
                        </select>
                    </div>

                    <div class="checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" class="checkbox-input" id="dmca" />
                            <span>Поставить DMCA</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" class="checkbox-input" id="amp" />
                            <span>Есть AMP (меняет название и нагрузку)</span>
                        </label>
                    </div>

                    <div class="subtasks-section">
                        <div class="subtasks-title">
                            📋 Подзадачи
                        </div>
                        <div id="subtasks-container"></div>
                        <div class="subtask-buttons-row">
                            <button class="subtask-templates-btn" id="open-subtask-templates">
                                📚 Типовые подзадачи
                            </button>
                            <button class="add-subtask-btn" id="add-subtask">
                                ➕ Добавить подзадачу
                            </button>
                        </div>
                    </div>

                    <hr class="divider" />

                    <div class="action-row">
                        <button class="btn-primary" id="process-automation" style="flex: 1;">
                            🚀 Запустить автоматизацию
                        </button>
                        <span class="settings-icon-btn" id="open-history-modal" title="История автоматизаций">📋</span>
                        <span class="settings-icon-btn" id="open-settings-single" title="Настройки">⚙️</span>
                    </div>
                </div>
            `;
        }

        getMassModeHTML() {
            return `
                <div class="mass-mode-content">
                    <div class="table-actions">
                        <button class="btn-add-task" id="add-task-btn">➕ Добавить задачу</button>
                        <button class="btn-clear-all" id="clear-all-tasks">🗑️ Очистить <span id="selected-tasks-count"></span></button>
                        <button class="btn-import" id="import-tasks-btn">📥 Импорт</button>
                        <button class="btn-export" id="export-tasks-btn">📤 Экспорт</button>
                        <button class="btn-summary" id="generate-summary-btn" title="Сохранить ТЗ локально (Excel)">📊 Выгрузить ТЗ <span class="selected-indicator"></span></button>
                        <button class="btn-cloud" id="generate-cloud-btn" title="Сохранить ТЗ в Google Sheets + пинг ответственных">☁️ Облако <span class="selected-indicator"></span></button>
                        <button class="btn-field-settings" id="open-unified-settings-btn" title="Настройка полей, aliases и типов задач">⚙️ Настройка полей</button>
                        <button class="btn-settings-mass" id="open-history-mass" title="История автоматизаций">📋</button>
                        <button class="btn-settings-mass" id="open-settings" title="Настройки API">🔧</button>
                    </div>

                    <div class="tasks-table-container" id="tasks-table-container"></div>

                    <!-- v4.5.1: Кнопка автоматизации скрыта - только режим ТЗ -->
                    <hr class="divider" style="display:none;" />

                    <button class="btn-primary" id="process-all-tasks" style="display:none !important; font-size: 16px; padding: 14px;">
                        🚀 Запустить автоматизацию (<span id="tasks-count">0</span> задач)
                    </button>
                </div>
            `;
        }

        switchMode(mode) {
            this.currentMode = mode;
            const container = this.shadowRoot.querySelector('.dashboard-container');

            // Обновляем кнопки
            this.shadowRoot.getElementById('mode-btn-single').classList.toggle('active', mode === 'single');
            this.shadowRoot.getElementById('mode-btn-mass').classList.toggle('active', mode === 'mass');

            // Переключаем размер контейнера
            container.classList.toggle('mass-mode', mode === 'mass');

            // Показываем нужный контейнер
            this.shadowRoot.getElementById('single-mode-container').classList.toggle('active', mode === 'single');
            this.shadowRoot.getElementById('mass-mode-container').classList.toggle('active', mode === 'mass');

            if (mode === 'mass') {
                this.renderTasksTable();
            }
        }

        // ===== v4.5.0: СВОДКА =====

        // v4.5.0: Генерация сводного отчёта с ТЗ
        generateSummaryReport() {
            // v4.5.2: Используем выбранные задачи или все
            const tasksToProcess = this.getSelectedTasks();

            if (!tasksToProcess.length) {
                showToast('⚠️ Выберите задачи для выгрузки ТЗ.\n\nОтметьте галочками нужные задачи в таблице.', 'warning');
                return;
            }

            // Проверяем что все задачи заполнены
            const emptyTasks = tasksToProcess.filter((t, i) => !t.taskName || t.taskName.trim() === '');
            if (emptyTasks.length > 0) {
                const emptyIndexes = tasksToProcess
                    .map((t, i) => (!t.taskName || t.taskName.trim() === '') ? (i + 1) : null)
                    .filter(i => i !== null)
                    .join(', ');
                showToast('⚠️ Не выбран тип задачи!\n\nЗаполните поле "Задача" в строках: ' + emptyIndexes, 'warning');
                return;
            }

            // v4.6.17: Проверка выбора 301/404 для задач с oldSub
            const noRedirectTasks = tasksToProcess.filter((t, i) => t.oldSub && !t.redirect301 && !t.redirect404);
            if (noRedirectTasks.length > 0) {
                const noRedirectIndexes = tasksToProcess
                    .map((t, i) => (t.oldSub && !t.redirect301 && !t.redirect404) ? (i + 1) : null)
                    .filter(i => i !== null)
                    .join(', ');
                showToast('⚠️ Не выбран тип редиректа (301/404)!\n\nВыберите 301 или 404 для старого поддомена в строках: ' + noRedirectIndexes, 'warning');
                return;
            }

            const templates = loadTemplates();
            const taskTypes = loadTaskTypes();

            // v4.5.2: Массив для хранения сгенерированных файлов
            const generatedFiles = [];

            // Маппинг переменных к названиям полей для уведомлений
            const variableToLabel = {
                'domain': 'Домен',
                'oldSub': 'Старый поддомен',
                'newSub': 'Новый поддомен',
                'alternateDomain': 'Домен подмены',
                'hreflangCode': 'hreflang',
                'redirect': 'Редирект',
                'priority': 'Приоритет',
                'cms': 'CMS',
                'notes': 'Примечания'
            };

            // Поля, которые НЕ проверяются (вспомогательные/управляющие)
            const excludedFromCheck = [
                'redirect301', 'redirect404', 'redirect',  // чекбоксы редиректов
                'dmca', 'amp',                             // чекбоксы
                'assignee',                                // ответственный (для уведомлений)
                'subtasks',                                // подзадачи
                'priority', 'cms', 'notes'                 // опциональные поля
            ];

            // Функция извлечения переменных из шаблона
            const extractVariables = (template) => {
                const matches = template.match(/\{\{(\w+)\}\}/g) || [];
                return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
            };

            // Функция очистки URL - убирает https:// и trailing slash
            const cleanUrl = (url) => {
                if (!url) return '';
                return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
            };

            // Проверяем все задачи на заполненность необходимых полей
            const warnings = [];

            tasksToProcess.forEach((task, index) => {
                // Определяем тип задачи по названию
                const taskTypesArr = Object.values(taskTypes);
                const matchedType = taskTypesArr.find(t => t.name === task.taskName);

                // Для произвольных задач (не из списка) - не проверяем обязательные поля
                if (!matchedType) {
                    return;
                }

                const taskType = taskTypes[matchedType.id];
                const tzTemplate = taskType.tzTemplate || '';
                const requiredVars = extractVariables(tzTemplate);

                // Собираем данные задачи
                const taskData = {
                    domain: cleanUrl(task.domain),
                    oldSub: cleanUrl(task.oldSub),
                    newSub: cleanUrl(task.newSub),
                    alternateDomain: cleanUrl(task.alternateDomain),
                    hreflangCode: task.templateIndex !== '' && task.templateIndex !== undefined,
                    redirect: task.redirect301 || task.redirect404,
                    priority: task.priority,
                    cms: task.cms,
                    notes: task.notes
                };

                // Проверяем незаполненные переменные (кроме исключённых)
                const missingFields = [];
                requiredVars.forEach(varName => {
                    // Пропускаем вспомогательные поля
                    if (excludedFromCheck.includes(varName)) {
                        return;
                    }

                    if (varName === 'hreflangCode') {
                        // hreflangCode заполнен если выбран шаблон
                        if (!taskData.hreflangCode) {
                            missingFields.push(variableToLabel[varName] || varName);
                        }
                    } else if (!taskData[varName]) {
                        missingFields.push(variableToLabel[varName] || varName);
                    }
                });

                if (missingFields.length > 0) {
                    const taskLabel = task.taskName || 'Задача ' + (index + 1);
                    warnings.push('📋 ' + taskLabel + '\n   → ' + missingFields.join(', '));
                }
            });

            // Показываем предупреждение если есть незаполненные поля
            if (warnings.length > 0) {
                const warningMsg = '⚠️ Не заполнены обязательные поля:\n\n' +
                    warnings.join('\n\n') +
                    '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nПродолжить? (пустые поля не будут добавлены в ТЗ)';

                if (!confirm(warningMsg)) {
                    return;
                }
            }

            // Создаём отдельный лист для каждой задачи
            tasksToProcess.forEach((task, index) => {
                // Очищаем данные
                const domain = cleanUrl(task.domain);
                const oldSub = cleanUrl(task.oldSub);
                const newSub = cleanUrl(task.newSub);
                const alternateDomain = cleanUrl(task.alternateDomain);

                // Пропускаем только если вообще ничего не заполнено
                if (!task.taskName && !domain && !oldSub && !newSub && !alternateDomain) {
                    console.warn(`Задача ${index + 1}: все поля пустые, пропускаем`);
                    return;
                }

                // Генерируем hreflang код
                const hreflangTemplate = task.templateIndex !== '' && task.templateIndex !== undefined ? templates[task.templateIndex] : null;
                let hreflangCode = '';
                if (hreflangTemplate) {
                    hreflangCode = hreflangTemplate.code
                        .replace(/\{\{newSub\}\}/g, newSub)
                        .replace(/\{\{domain\}\}/g, domain);
                } else if (newSub && domain) {
                    hreflangCode = `<link rel="canonical" href="https://${newSub}/"/>
<link rel="alternate" hreflang="x-default" href="https://${domain}/"/>
<link rel="alternate" hreflang="ru" href="https://${newSub}/"/>`;
                }

                // Определяем тип задачи
                const taskTypesArr = Object.values(taskTypes);
                const matchedType = taskTypesArr.find(t => t.name === task.taskName);

                if(DEBUG) console.log('Task:', task.taskName, 'Matched:', matchedType ? matchedType.name : 'NOT FOUND');

                // Получаем имя ответственного из маппинга
                const rocketMapping = loadRocketChatMapping();
                let assigneeName = '';
                if (task.assignee && rocketMapping[task.assignee]) {
                    const data = rocketMapping[task.assignee];
                    assigneeName = typeof data === 'object' ? (data.asanaName || data.name) : data;
                }

                // v4.5.2: Формируем список подзадач с полной информацией
                const subtasksList = (task.subtasks || [])
                    .filter(s => s.name && s.name.trim())
                    .map(s => {
                        let line = '- ' + s.name;
                        const meta = [];
                        if (s.priority) meta.push(s.priority);
                        if (s.allocation) meta.push(s.allocation + '%');
                        if (s.assignee && rocketMapping[s.assignee]) {
                            const data = rocketMapping[s.assignee];
                            const name = typeof data === 'object' ? (data.asanaName || data.name) : data;
                            meta.push(name);
                        }
                        if (meta.length > 0) line += ' | ' + meta.join(' | ');
                        return line;
                    })
                    .join('\n');

                let tzContent = '';

                if (matchedType) {
                    // Тип задачи из настроек - используем шаблон
                    const taskType = taskTypes[matchedType.id];
                    tzContent = taskType.tzTemplate || '';

                    // Заменяем переменные в шаблоне
                    tzContent = tzContent
                        .replace(/\{\{department\}\}/g, task.department || '')
                        .replace(/\{\{domain\}\}/g, domain)
                        .replace(/\{\{oldSub\}\}/g, oldSub)
                        .replace(/\{\{newSub\}\}/g, newSub)
                        .replace(/\{\{alternateDomain\}\}/g, alternateDomain || oldSub)
                        .replace(/\{\{hreflangCode\}\}/g, hreflangCode)
                        // v4.5.6: Новые переменные для редиректов
                        .replace(/\{\{toUrl\}\}/g, task.toUrl || '')
                        // v4.6.10: oldUrl с разделением по типам
                        .replace(/\{\{oldUrl\}\}/g, formatOldUrlForDisplay(task.oldUrl))
                        .replace(/\{\{oldUrl404\}\}/g, parseOldUrls(task.oldUrl).urls404.join('\n'))
                        .replace(/\{\{oldUrl301\}\}/g, parseOldUrls(task.oldUrl).urls301.join('\n'))
                        .replace(/\{\{oldUrlFormatted\}\}/g, formatOldUrlForTZ(task.oldUrl))
                        // Вспомогательные поля (для использования в шаблоне)
                        .replace(/\{\{redirect\}\}/g, task.redirect301 ? '301' : (task.redirect404 ? '404' : ''))
                        .replace(/\{\{redirect301\}\}/g, task.redirect301 ? 'Да' : 'Нет')
                        .replace(/\{\{redirect404\}\}/g, task.redirect404 ? 'Да' : 'Нет')
                        .replace(/\{\{priority\}\}/g, task.priority || '')
                        .replace(/\{\{cms\}\}/g, task.cms || '')
                        .replace(/\{\{dmca\}\}/g, task.dmca ? 'Да' : 'Нет')
                        .replace(/\{\{amp\}\}/g, formatAmpText(task.amp, domain, newSub))
                        .replace(/\{\{assignee\}\}/g, assigneeName)
                        .replace(/\{\{subtasks\}\}/g, subtasksList)
                        .replace(/\{\{notes\}\}/g, task.notes || '');
                    
                    // v4.6.16: Автоматически добавляем отдел в начало ТЗ если заполнен
                    if (task.department && !taskType.tzTemplate?.includes('{{department}}')) {
                        tzContent = `Отдел: ${task.department}\n\n${tzContent}`;
                    }
                } else {
                    // Произвольная задача - название + все заполненные поля в табличном формате
                    const lines = [];
                    lines.push(task.taskName); // Заголовок
                    lines.push(''); // Пустая строка

                    if (task.department) lines.push(`Отдел:\t${task.department}`);
                    if (domain) lines.push(`Домен:\t${domain}`);
                    if (oldSub) lines.push(`Старый поддомен:\t${oldSub}`);
                    if (newSub) lines.push(`Новый поддомен:\t${newSub}`);
                    if (alternateDomain) lines.push(`Домен подмены:\t${alternateDomain}`);
                    // v4.5.6: Новые поля
                    if (task.toUrl) lines.push(`URL дропа:\t${task.toUrl}`);
                    // v4.6.10: oldUrl с разделением по типам
                    if (task.oldUrl) {
                        const parsed = parseOldUrls(task.oldUrl);
                        if (parsed.urls404.length > 0) {
                            lines.push(`URL для 404:\n${parsed.urls404.join('\n')}`);
                        }
                        if (parsed.urls301.length > 0) {
                            lines.push(`URL для 301:\n${parsed.urls301.join('\n')}`);
                        }
                    }
                    if (task.templateIndex !== '' && task.templateIndex !== undefined) {
                        const tpl = templates[task.templateIndex];
                        if (tpl && hreflangCode) {
                            lines.push(`hreflang:\t${tpl.name}`);
                            lines.push('');
                            lines.push(hreflangCode);
                        } else if (tpl) {
                            lines.push(`hreflang:\t${tpl.name}`);
                        }
                    }
                    if (task.redirect301) lines.push(`301 редирект:\tДа`);
                    if (task.redirect404) lines.push(`404:\tДа`);
                    if (task.priority) lines.push(`Приоритет:\t${task.priority}`);
                    if (task.cms) lines.push(`CMS:\t${task.cms}`);
                    if (task.dmca) lines.push(`DMCA:\tДа`);
                    if (task.amp) { const ampText = formatAmpText(task.amp, domain, newSub); if (ampText) lines.push(`AMP:\t${ampText}`); }
                    if (assigneeName) lines.push(`Ответственный:\t${assigneeName}`);
                    if (task.notes) lines.push(`Примечания:\t${task.notes}`);

                    // v4.5.2: Подзадачи с полной информацией
                    if (subtasksList) {
                        lines.push('');
                        lines.push('Подзадачи:');
                        (task.subtasks || [])
                            .filter(s => s.name && s.name.trim())
                            .forEach(s => {
                                let line = s.name;
                                const meta = [];
                                if (s.priority) meta.push(s.priority);
                                if (s.allocation) meta.push(s.allocation + '%');
                                if (s.assignee && rocketMapping[s.assignee]) {
                                    const data = rocketMapping[s.assignee];
                                    const name = typeof data === 'object' ? (data.asanaName || data.name) : data;
                                    meta.push(name);
                                }
                                if (meta.length > 0) line += '\t' + meta.join(' | ');
                                lines.push(`•\t${line}`);
                            });
                    }

                    tzContent = lines.join('\n');
                }

                // v4.5.0: Для типов из списка добавляем блок с активированными полями
                if (matchedType) {
                    const additionalInfo = [];

                    if (task.redirect301) additionalInfo.push('301 редирект: Да');
                    if (task.redirect404) additionalInfo.push('404 ошибка: Да');
                    if (task.dmca) additionalInfo.push('DMCA: Да');
                    if (task.amp) { const ampText = formatAmpText(task.amp, domain, newSub); if (ampText) additionalInfo.push('AMP: ' + ampText); }
                    if (task.priority) additionalInfo.push(`Приоритет: ${task.priority}`);
                    if (task.cms) additionalInfo.push(`CMS: ${task.cms}`);
                    if (assigneeName) additionalInfo.push(`Ответственный: ${assigneeName}`);
                    if (task.notes) additionalInfo.push(`Примечания: ${task.notes}`);

                    // Добавляем подзадачи если есть
                    if (subtasksList) {
                        additionalInfo.push('');
                        additionalInfo.push('Подзадачи:');
                        additionalInfo.push(subtasksList);
                    }

                    // Добавляем блок в конец ТЗ если есть что добавить
                    if (additionalInfo.length > 0) {
                        tzContent += '\n\n--- Дополнительно ---\n' + additionalInfo.join('\n');
                    }
                }

                // Конвертируем в массив строк для Excel
                const tzLines = tzContent.split('\n').map(line => [line]);

                // v4.5.2: Создаём отдельный файл для каждой задачи
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(tzLines);

                // Устанавливаем ширину колонки
                ws['!cols'] = [{ wch: 120 }];

                // Имя листа
                let sheetName = task.taskName || newSub || domain || `Задача_${index + 1}`;
                sheetName = sheetName.substring(0, 31).replace(/[\\/*?:\[\]]/g, '_');

                XLSX.utils.book_append_sheet(wb, ws, sheetName);

                // Формируем имя файла: идентификатор - задача [ответственный].xlsx
                const today = new Date().toISOString().split('T')[0];
                // Берём первое непустое: domain → newSub → oldSub → alternateDomain
                const identifier = domain || newSub || oldSub || alternateDomain || '';
                const safeTaskName = (task.taskName || 'задача').replace(/[\\/*?:\[\]<>|"]/g, '_');

                // Формируем имя: если есть домен - "домен - задача", иначе просто "задача"
                let filename;
                if (identifier && !/^\d+$/.test(identifier)) {
                    const safeIdentifier = identifier.replace(/[\\/*?:\[\]<>|"]/g, '_');
                    filename = `${safeIdentifier} - ${safeTaskName}`;
                } else {
                    filename = safeTaskName;
                }

                // Добавляем ответственного если есть
                if (assigneeName) {
                    const safeAssignee = assigneeName.replace(/[\\/*?:\[\]<>|"]/g, '_');
                    filename += ` [${safeAssignee}]`;
                }

                filename += '.xlsx';

                XLSX.writeFile(wb, filename);
                generatedFiles.push({ filename, task });
            });

            if (generatedFiles.length === 0) {
                showToast('Нет задач с данными для генерации ТЗ.');
                return;
            }

            const today = new Date().toISOString().split('T')[0];

            // v4.5.1: Запись в историю локальных ТЗ
            generatedFiles.forEach(({ filename, task }) => {
                if (task.taskName) {
                    addToLocalTzHistory({
                        taskName: task.taskName,
                        domain: cleanUrl(task.domain),
                        oldSub: cleanUrl(task.oldSub),
                        newSub: cleanUrl(task.newSub),
                        alternateDomain: cleanUrl(task.alternateDomain),
                        department: task.department || '',
                        priority: task.priority || '',
                        cms: task.cms || '',
                        redirect301: task.redirect301 || false,
                        redirect404: task.redirect404 || false,
                        hasAMP: task.amp || false,
                        dmca: task.dmca || false,
                        subtasksCount: (task.subtasks || []).filter(s => s.name && s.name.trim()).length,
                        subtasks: (task.subtasks || []).filter(s => s.name && s.name.trim()).map(s => ({ name: s.name, priority: s.priority })),
                        fileName: filename
                    });
                }
            });

            showToast(`📊 Сохранено ${generatedFiles.length} файлов ТЗ`, 'success');
        }

        // v4.5.0: Генерация облачного отчёта (Google Sheets / Microsoft Excel) + пинг Rocket.Chat
        async generateCloudReport() {
            // v4.5.2: Используем выбранные задачи или все
            const tasksToProcess = this.getSelectedTasks();

            if (!tasksToProcess.length) {
                showToast('⚠️ Выберите задачи для отправки в облако.\n\nОтметьте галочками нужные задачи в таблице.', 'warning');
                return;
            }

            // Проверяем что все задачи заполнены
            const emptyTasks = tasksToProcess.filter((t, i) => !t.taskName || t.taskName.trim() === '');
            if (emptyTasks.length > 0) {
                const emptyIndexes = tasksToProcess
                    .map((t, i) => (!t.taskName || t.taskName.trim() === '') ? (i + 1) : null)
                    .filter(i => i !== null)
                    .join(', ');
                showToast('⚠️ Не выбран тип задачи!\n\nЗаполните поле "Задача" в строках: ' + emptyIndexes, 'warning');
                return;
            }

            // v4.6.17: Проверка выбора 301/404 для задач с oldSub
            const noRedirectTasks = tasksToProcess.filter((t, i) => t.oldSub && !t.redirect301 && !t.redirect404);
            if (noRedirectTasks.length > 0) {
                const noRedirectIndexes = tasksToProcess
                    .map((t, i) => (t.oldSub && !t.redirect301 && !t.redirect404) ? (i + 1) : null)
                    .filter(i => i !== null)
                    .join(', ');
                showToast('⚠️ Не выбран тип редиректа (301/404)!\n\nВыберите 301 или 404 для старого поддомена в строках: ' + noRedirectIndexes, 'warning');
                return;
            }

            // Проверяем обязательные поля для каждого типа задачи
            const taskTypes = loadTaskTypes();
            const cleanUrl = (url) => url ? url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

            const fieldLabels = {
                'domain': 'Домен',
                'oldSub': 'Старый поддомен',
                'newSub': 'Новый поддомен',
                'alternateDomain': 'Домен подмены',
                'hreflangCode': 'hreflang'
            };

            const missingFieldsRows = [];

            tasksToProcess.forEach((task, index) => {
                const taskTypesArr = Object.values(taskTypes);
                const matchedType = taskTypesArr.find(t => t.name === task.taskName);

                // Только для типов из настроек проверяем обязательные поля
                if (matchedType) {
                    const taskType = taskTypes[matchedType.id];
                    const tzTemplate = taskType.tzTemplate || '';

                    // Извлекаем переменные из шаблона
                    const varMatches = tzTemplate.match(/\{\{(\w+)\}\}/g) || [];
                    const requiredVars = [...new Set(varMatches.map(m => m.replace(/\{\{|\}\}/g, '')))];

                    let hasMissing = false;

                    requiredVars.forEach(varName => {
                        // Пропускаем служебные поля
                        if (['redirect', 'redirect301', 'redirect404', 'priority', 'cms', 'dmca', 'amp', 'assignee', 'subtasks', 'notes'].includes(varName)) {
                            return;
                        }

                        let isEmpty = false;
                        if (varName === 'domain') isEmpty = !cleanUrl(task.domain);
                        else if (varName === 'oldSub') isEmpty = !cleanUrl(task.oldSub);
                        else if (varName === 'newSub') isEmpty = !cleanUrl(task.newSub);
                        else if (varName === 'alternateDomain') isEmpty = !cleanUrl(task.alternateDomain);
                        else if (varName === 'hreflangCode') isEmpty = task.templateIndex === '' || task.templateIndex === undefined;

                        if (isEmpty) hasMissing = true;
                    });

                    if (hasMissing) {
                        missingFieldsRows.push(index + 1);
                    }
                }
            });

            // v4.5.5: Компактное предупреждение
            if (missingFieldsRows.length > 0) {
                const warningMsg = '⚠️ Есть незаполненные поля в ' + missingFieldsRows.length + ' строках:\n' + missingFieldsRows.join(', ') + '\n\nПродолжить? (пустые поля не будут добавлены в ТЗ)';
                if (!confirm(warningMsg)) {
                    return;
                }
            }

            // Проверяем задачи с включённым пингом но без ответственного
            const tasksWithPingNoAssignee = tasksToProcess.filter(t => t.pingRocket && !t.assignee);
            if (tasksWithPingNoAssignee.length > 0) {
                const taskNames = tasksWithPingNoAssignee.map((t, i) => t.taskName || 'Задача ' + (i + 1)).join('\n');
                showToast('⚠️ Включён пинг, но не выбран ответственный:\n\n' + taskNames + '\n\nВыберите ответственного или отключите пинг.', 'warning');
                return;
            }

            // Определяем провайдер
            const cloudProvider = GM_getValue('cloudProvider', 'google');
            // v4.5.5: Поддержка нескольких URL
            const googleScriptUrlsRaw = GM_getValue('googleAppsScriptUrl', CONFIG.cloud.defaultGoogleScriptUrl);
            const googleScriptUrls = googleScriptUrlsRaw.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));
            const powerAutomateUrl = GM_getValue('powerAutomateUrl', '');
            const parallelMode = GM_getValue('cloudParallelMode', false);

            // Проверяем настроен ли URL для выбранного провайдера
            if (cloudProvider === 'google' && googleScriptUrls.length === 0) {
                showToast('⚠️ Не настроен Google Apps Script URL\n\nНастройте его в 🔧 Настройки → вкладка "Облако"');
                return;
            }
            if (cloudProvider === 'microsoft' && !powerAutomateUrl) {
                showToast('⚠️ Не настроен Power Automate URL\n\nНастройте его в 🔧 Настройки → вкладка "Облако"');
                return;
            }

            // Собираем задачи с пингом
            const tasksToNotify = tasksToProcess.filter(t => t.pingRocket && t.assignee);
            const rocketMapping = loadRocketChatMapping();

            // Показываем лог и начинаем
            const providerName = cloudProvider === 'google' ? 'Google Sheets' : 'Microsoft Excel';
            this.showStatusLog();
            this.setProcessingState(true);  // v4.5.5: Начало фоновой операции
            this.logMessage('☁️ Создание ТЗ в облаке...');
            this.logMessage('📊 Провайдер: ' + providerName);
            this.logMessage('📋 Задач: ' + tasksToProcess.length);
            
            // v4.5.5: Показываем количество endpoints
            if (cloudProvider === 'google' && googleScriptUrls.length > 1) {
                this.logMessage(`🔀 Endpoints: ${googleScriptUrls.length} (${parallelMode ? 'параллельно' : 'round-robin'})`);
            } else {
                this.logMessage('🔗 URL: ' + (cloudProvider === 'google' ? googleScriptUrls[0].substring(0, 50) + '...' : powerAutomateUrl.substring(0, 50) + '...'));
            }

            // Логируем каждую задачу
            tasksToProcess.forEach((task, i) => {
                const taskInfo = task.taskName || 'Без названия';
                const domain = task.domain ? task.domain.replace(/^https?:\/\//, '') : '';
                this.logMessage('   ' + (i + 1) + '. ' + taskInfo + (domain ? ' (' + domain + ')' : ''));
            });

            this.logMessage('');
            this.logMessage('⏳ Отправка в ' + providerName + '...');

            try {
                // Подготавливаем данные
                const sheetData = this.prepareCloudData(tasksToProcess);
                this.logMessage('📦 Размер данных: ' + JSON.stringify(sheetData).length + ' байт');

                // v4.5.5: Load Balancing для Google Sheets
                let urlIndex = 0; // Round-robin счётчик
                
                // v4.5.5: Функция отправки с failover
                const sendWithFailover = async (data, preferredUrlIndex = 0) => {
                    const startTime = Date.now();
                    let lastError = null;
                    
                    // Пробуем все URL начиная с preferredUrlIndex
                    for (let attempt = 0; attempt < googleScriptUrls.length; attempt++) {
                        const currentUrlIndex = (preferredUrlIndex + attempt) % googleScriptUrls.length;
                        const url = googleScriptUrls[currentUrlIndex];
                        
                        try {
                            const result = await this.sendToGoogleSheets(url, data);
                            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                            
                            if (googleScriptUrls.length > 1) {
                                this.logMessage(`   ✓ [#${currentUrlIndex + 1}] Успешно за ${elapsed}с`, 'success');
                            } else {
                                this.logMessage(`   ✓ Успешно за ${elapsed}с`, 'success');
                            }
                            return result;
                        } catch (err) {
                            lastError = err;
                            if (googleScriptUrls.length > 1 && attempt < googleScriptUrls.length - 1) {
                                this.logMessage(`   ⚠️ [#${currentUrlIndex + 1}] ${err.message} → пробуем #${((currentUrlIndex + 1) % googleScriptUrls.length) + 1}`, 'warning');
                            }
                        }
                    }
                    
                    // Все URL не сработали - retry с задержкой
                    this.logMessage(`   ⚠️ Все endpoints не ответили, повтор через 3с...`, 'warning');
                    await new Promise(r => setTimeout(r, 3000));
                    
                    // Последняя попытка на первый URL
                    try {
                        const result = await this.sendToGoogleSheets(googleScriptUrls[0], data);
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        this.logMessage(`   ✓ Успешно за ${elapsed}с (retry)`, 'success');
                        return result;
                    } catch (finalErr) {
                        throw lastError || finalErr;
                    }
                };
                
                let response;
                
                if (cloudProvider === 'google') {
                    // v4.5.5: Показываем прогресс-бар всегда
                    this.showProgress(true);
                    this.updateProgress(0, sheetData.length, 'Подготовка...');
                    
                    const allResponses = [];
                    const startTime = Date.now();
                    
                    if (parallelMode && googleScriptUrls.length > 1) {
                        // ⚡ Параллельная отправка - группируем задачи по URL
                        this.logMessage(`⚡ Параллельный режим: ${googleScriptUrls.length} потоков`);
                        
                        // Распределяем задачи по URL
                        const taskGroups = googleScriptUrls.map(() => []);
                        sheetData.forEach((task, i) => {
                            taskGroups[i % googleScriptUrls.length].push(task);
                        });
                        
                        // Отправляем параллельно
                        const promises = taskGroups.map((group, urlIdx) => {
                            if (group.length === 0) return Promise.resolve(null);
                            this.logMessage(`   📤 Поток #${urlIdx + 1}: ${group.length} задач`);
                            return this.sendToGoogleSheets(googleScriptUrls[urlIdx], group)
                                .then(res => {
                                    this.logMessage(`   ✓ Поток #${urlIdx + 1} завершён`, 'success');
                                    return res;
                                })
                                .catch(err => {
                                    this.logMessage(`   ❌ Поток #${urlIdx + 1}: ${err.message}`, 'error');
                                    return null;
                                });
                        });
                        
                        const results = await Promise.all(promises);
                        allResponses.push(...results.filter(r => r && r.success));
                        
                        this.updateProgress(sheetData.length, sheetData.length, '100%');
                        
                    } else {
                        // 🔄 Последовательная отправка с round-robin
                        for (let i = 0; i < sheetData.length; i++) {
                            this.logMessage('');
                            this.logMessage(`📤 Задача ${i + 1}/${sheetData.length}...`);
                            this.updateProgress(i, sheetData.length);
                            
                            try {
                                // Round-robin: каждая задача на следующий URL
                                const batchResponse = await sendWithFailover([sheetData[i]], urlIndex);
                                allResponses.push(batchResponse);
                                urlIndex = (urlIndex + 1) % googleScriptUrls.length;
                            } catch (err) {
                                this.logMessage(`   ❌ Задача ${i + 1} не отправлена: ${err.message}`, 'error');
                            }
                            
                            this.updateProgress(i + 1, sheetData.length);
                            
                            // Пауза между задачами (меньше если много URL)
                            if (i < sheetData.length - 1) {
                                const delay = googleScriptUrls.length > 1 ? 500 : 1000;
                                await new Promise(r => setTimeout(r, delay));
                            }
                        }
                    }
                    
                    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
                    this.logMessage('');
                    this.logMessage(`⏱️ Общее время: ${totalTime}с`);
                    
                    if (allResponses.length === 0) {
                        this.showProgress(false);
                        throw new Error('Все задачи не удалось отправить');
                    }
                    
                    // Объединяем результаты и убираем дубликаты URL
                    const allSheets = allResponses.flatMap(r => r.sheets || [{ url: r.sheetUrl, name: r.sheetName }]);
                    const uniqueUrls = [...new Set(allSheets.map(s => s.url).filter(u => u))];
                    const uniqueSheets = uniqueUrls.map(url => allSheets.find(s => s.url === url));
                    
                    response = {
                        success: allResponses.length > 0,
                        sheetUrl: allResponses[0]?.sheetUrl,
                        sheetName: allResponses[0]?.sheetName,
                        sheets: uniqueSheets
                    };
                    
                    this.logMessage('');
                    this.logMessage(`📊 Итого: ${allResponses.length}/${sheetData.length} задач отправлено`);
                } else {
                    response = await this.sendToPowerAutomate(powerAutomateUrl, sheetData);
                }

                if (response.success && response.sheetUrl) {
                    this.logMessage('✅ ТЗ успешно сохранено!', 'success');

                    // v4.5.2: Показываем все URL если несколько таблиц
                    if (response.sheets && response.sheets.length > 1) {
                        this.logMessage('📄 Создано таблиц: ' + response.sheets.length, 'success');
                        response.sheets.forEach((sheet, i) => {
                            this.logMessage(`   ${i + 1}. ${sheet.name}`, 'success');
                            this.logMessage(`      🔗 ${sheet.url}`, 'success');
                        });
                    } else {
                        this.logMessage('🔗 ' + response.sheetUrl, 'success');
                    }

                    // v4.5.1: Запись в историю облачных ТЗ
                    const cleanUrlFn = (url) => url ? url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

                    // v4.5.2: Записываем каждую задачу со своим URL
                    tasksToProcess.forEach((task, idx) => {
                        if (task.taskName) {
                            const sheetInfo = response.sheets && response.sheets[idx] ? response.sheets[idx] : { url: response.sheetUrl, name: response.sheetName };
                            addToCloudTzHistory({
                                taskName: task.taskName,
                                domain: cleanUrlFn(task.domain),
                                oldSub: cleanUrlFn(task.oldSub),
                                newSub: cleanUrlFn(task.newSub),
                                alternateDomain: cleanUrlFn(task.alternateDomain),
                                department: task.department || '',
                                priority: task.priority || '',
                                cms: task.cms || '',
                                redirect301: task.redirect301 || false,
                                redirect404: task.redirect404 || false,
                                hasAMP: task.amp || false,
                                dmca: task.dmca || false,
                                subtasksCount: (task.subtasks || []).filter(s => s.name && s.name.trim()).length,
                                subtasks: (task.subtasks || []).filter(s => s.name && s.name.trim()).map(s => ({ name: s.name, priority: s.priority })),
                                sheetName: sheetInfo.name || task.taskName,
                                sheetUrl: sheetInfo.url,
                                provider: providerName
                            });
                        }
                    });

                    // v4.5.2: Сначала показываем URL — пинги идут фоном
                    this.logMessage('');
                    this.logMessage('🎉 Готово!', 'success');
                    this.showProgress(false);  // v4.5.5: скрываем прогресс-бар
                    this.setProcessingState(false);  // v4.5.5: Конец фоновой операции
                    
                    // v4.5.5: Уведомляем если окно скрыто
                    if (this.shadowHost && this.shadowHost.style.display === 'none') {
                        showToast(`✅ Готово! ${tasksToProcess.length} задач отправлено в ${providerName}`, 'success', 5000);
                    }

                    // Показываем первый URL в виджете (или все если мало)
                    this.logCloudResult(response.sheetUrl, tasksToNotify.length, response.sheets);

                    // v4.5.2: Параллельная отправка пингов (батчами по 5)
                    // Каждому исполнителю отправляем его URL
                    if (tasksToNotify.length > 0) {
                        const tasksWithUrls = tasksToNotify.map((task, idx) => {
                            const originalIdx = tasksToProcess.findIndex(t => t.id === task.id);
                            const sheetInfo = response.sheets && response.sheets[originalIdx] ? response.sheets[originalIdx] : { url: response.sheetUrl };
                            return { ...task, sheetUrl: sheetInfo.url };
                        });
                        this.sendRocketPingsBatched(tasksWithUrls, rocketMapping);
                    }

                } else {
                    throw new Error(response.error || 'Неизвестная ошибка');
                }
            } catch (error) {
                this.showProgress(false);  // v4.5.5: скрываем прогресс-бар
                this.setProcessingState(false);  // v4.5.5: Конец фоновой операции
                this.logMessage('');
                this.logMessage('❌ Ошибка: ' + error.message, 'error');
                this.logMessage('');
                this.logMessage('💡 Возможные причины:', 'warning');
                this.logMessage('   • Таймаут сервера (слишком много данных)');
                this.logMessage('   • Проблема с Google Apps Script');
                this.logMessage('   • Сетевые ограничения');
                this.logMessage('');
                this.logMessage('🔧 Попробуйте:');
                this.logMessage('   • Уменьшить количество задач');
                this.logMessage('   • Повторить отправку');
                this.logMessage('   • Проверить URL в настройках');
                
                // v4.5.5: Уведомляем если окно скрыто
                if (this.shadowHost && this.shadowHost.style.display === 'none') {
                    showToast('❌ Ошибка при отправке: ' + error.message, 'error', 5000);
                }
            }
        }

        // v4.5.2: Параллельная отправка пингов батчами (не блокирует UI)
        async sendRocketPingsBatched(tasksToNotify, rocketMapping) {
            const BATCH_SIZE = 5;
            const batches = [];

            // Разбиваем на батчи по 5
            for (let i = 0; i < tasksToNotify.length; i += BATCH_SIZE) {
                batches.push(tasksToNotify.slice(i, i + BATCH_SIZE));
            }

            this.logMessage('');
            this.logMessage(`📨 Отправка уведомлений (${tasksToNotify.length})...`);

            let successCount = 0;
            let failCount = 0;

            // Обрабатываем батчи последовательно, внутри батча — параллельно
            for (const batch of batches) {
                const results = await Promise.allSettled(
                    batch.map(task => {
                        const userData = rocketMapping[task.assignee];
                        if (!userData) return Promise.resolve({ skipped: true });

                        const rocketUsername = typeof userData === 'object' ? userData.name : userData;
                        // v4.5.2: Используем URL из задачи (каждая задача имеет свой sheetUrl)
                        return this.sendRocketPing(rocketUsername, task, task.sheetUrl)
                            .then(() => ({ success: true, username: rocketUsername, taskName: task.taskName }))
                            .catch(e => ({ success: false, username: rocketUsername, taskName: task.taskName, error: e.message }));
                    })
                );

                // Логируем результаты батча
                results.forEach(result => {
                    if (result.status === 'fulfilled' && result.value && !result.value.skipped) {
                        if (result.value.success) {
                            successCount++;
                            this.logMessage(`   ✓ @${result.value.username}`, 'success');
                        } else {
                            failCount++;
                            this.logMessage(`   ⚠️ @${result.value.username}: ${result.value.error}`, 'error');
                        }
                    }
                });
            }

            // Итог
            if (failCount > 0) {
                this.logMessage(`📊 Пинги: ${successCount} успешно, ${failCount} ошибок`);
            } else if (successCount > 0) {
                this.logMessage(`📊 Все пинги отправлены (${successCount})`, 'success');
            }
        }

        // v4.5.1: Вывод результата в лог с кнопкой копирования
        logCloudResult(sheetUrl, notifyCount, sheets = null) {
            const logContent = this.shadowRoot.getElementById('log-content');
            if (!logContent) return;

            const resultDiv = document.createElement('div');
            resultDiv.className = 'log-cloud-result';
            resultDiv.innerHTML = `
                <style>
                    .log-cloud-result {
                        margin-top: 12px;
                        padding: 12px;
                        background: #1a2e1a;
                        border: 1px solid #2e7d32;
                        border-radius: 8px;
                    }
                    .log-cloud-url {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .log-cloud-url-text {
                        flex: 1;
                        font-size: 12px;
                        color: #4fc3f7;
                        word-break: break-all;
                        padding: 8px;
                        background: #0d1a0d;
                        border: 1px solid #333;
                        border-radius: 4px;
                        font-family: monospace;
                        cursor: pointer;
                    }
                    .log-cloud-url-text:hover { background: #1a2a1a; }
                    .log-cloud-actions {
                        display: flex;
                        gap: 8px;
                    }
                    .log-cloud-btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .log-cloud-btn-open {
                        background: #1976d2;
                        color: white;
                    }
                    .log-cloud-btn-open:hover { background: #1565c0; }
                    .log-cloud-stats {
                        font-size: 11px;
                        color: #888;
                        margin-top: 8px;
                    }
                </style>
                <div class="log-cloud-url">
                    <div class="log-cloud-url-text" id="log-url-text-${Date.now()}" title="Клик для копирования">${sheetUrl}</div>
                </div>
                <div class="log-cloud-actions">
                    <button class="log-cloud-btn log-cloud-btn-open" id="log-open-btn-${Date.now()}">
                        📋 История облачных ТЗ
                    </button>
                </div>
                ${notifyCount > 0 ? '<div class="log-cloud-stats">📨 Уведомлений: ' + notifyCount + '</div>' : ''}
            `;

            logContent.appendChild(resultDiv);
            logContent.scrollTop = logContent.scrollHeight;

            // Клик по URL для копирования
            const urlText = resultDiv.querySelector('[id^="log-url-text"]');
            urlText.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(sheetUrl);
                    urlText.style.background = '#2e7d32';
                    urlText.textContent = '✓ Скопировано!';
                    setTimeout(() => {
                        urlText.style.background = '';
                        urlText.textContent = sheetUrl;
                    }, 1500);
                } catch (e) {
                    // fallback
                    const textarea = document.createElement('textarea');
                    textarea.value = sheetUrl;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    urlText.textContent = '✓ Скопировано!';
                    setTimeout(() => { urlText.textContent = sheetUrl; }, 1500);
                }
            });

            // Кнопка открывает историю облачных ТЗ
            const openBtn = resultDiv.querySelector('[id^="log-open-btn"]');
            openBtn.addEventListener('click', () => this.openAutomationHistoryModal('cloud'));
        }

        // Подготовка данных для Google Sheets
        prepareCloudData(tasksToProcess = null) {
            const tasks = tasksToProcess || this.tasks;
            const templates = loadTemplates();
            const taskTypes = loadTaskTypes();
            const rocketMapping = loadRocketChatMapping();

            const cleanUrl = (url) => {
                if (!url) return '';
                return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
            };

            return tasks.map((task, index) => {
                const domain = cleanUrl(task.domain);
                const oldSub = cleanUrl(task.oldSub);
                const newSub = cleanUrl(task.newSub);
                const alternateDomain = cleanUrl(task.alternateDomain);

                // Ответственный
                let assigneeName = '';
                if (task.assignee && rocketMapping[task.assignee]) {
                    const data = rocketMapping[task.assignee];
                    assigneeName = typeof data === 'object' ? (data.asanaName || data.name) : data;
                }

                // hreflang код
                const hreflangTemplate = task.templateIndex !== '' && task.templateIndex !== undefined ? templates[task.templateIndex] : null;
                let hreflangCode = '';
                if (hreflangTemplate) {
                    hreflangCode = hreflangTemplate.code
                        .replace(/\{\{newSub\}\}/g, newSub)
                        .replace(/\{\{domain\}\}/g, domain);
                }

                // Получаем шаблон ТЗ
                const taskTypesArr = Object.values(taskTypes);
                const matchedType = taskTypesArr.find(t => t.name === task.taskName);

                let tzContent = '';

                if (matchedType) {
                    // Тип задачи из настроек - используем шаблон
                    const taskType = taskTypes[matchedType.id];
                    tzContent = taskType.tzTemplate || '';

                    // v4.5.2: Формируем список подзадач с полной информацией
                    const subtasksList = (task.subtasks || [])
                        .filter(s => s.name && s.name.trim())
                        .map(s => {
                            let line = '• ' + s.name;
                            const meta = [];
                            if (s.priority) meta.push(s.priority);
                            if (s.allocation) meta.push(s.allocation + '%');
                            if (s.assignee && rocketMapping[s.assignee]) {
                                const data = rocketMapping[s.assignee];
                                const name = typeof data === 'object' ? (data.asanaName || data.name) : data;
                                meta.push(name);
                            }
                            if (meta.length > 0) line += ' | ' + meta.join(' | ');
                            return line;
                        })
                        .join('\n');

                    // Заменяем переменные
                    tzContent = tzContent
                        .replace(/\{\{department\}\}/g, task.department || '')
                        .replace(/\{\{domain\}\}/g, domain)
                        .replace(/\{\{oldSub\}\}/g, oldSub)
                        .replace(/\{\{newSub\}\}/g, newSub)
                        .replace(/\{\{alternateDomain\}\}/g, alternateDomain || oldSub)
                        .replace(/\{\{hreflangCode\}\}/g, hreflangCode)
                        // v4.5.6: Новые переменные для редиректов
                        .replace(/\{\{toUrl\}\}/g, task.toUrl || '')
                        // v4.6.10: oldUrl с разделением по типам
                        .replace(/\{\{oldUrl\}\}/g, formatOldUrlForDisplay(task.oldUrl))
                        .replace(/\{\{oldUrl404\}\}/g, parseOldUrls(task.oldUrl).urls404.join('\n'))
                        .replace(/\{\{oldUrl301\}\}/g, parseOldUrls(task.oldUrl).urls301.join('\n'))
                        .replace(/\{\{oldUrlFormatted\}\}/g, formatOldUrlForTZ(task.oldUrl))
                        .replace(/\{\{subtasks\}\}/g, subtasksList);

                    // v4.6.16: Автоматически добавляем отдел в начало ТЗ если заполнен
                    if (task.department && !taskType.tzTemplate?.includes('{{department}}')) {
                        tzContent = `Отдел: ${task.department}\n\n${tzContent}`;
                    }

                    // Добавляем подзадачи в конец если они не в шаблоне
                    if (subtasksList && !taskType.tzTemplate?.includes('{{subtasks}}')) {
                        tzContent += '\n\nПодзадачи:\n' + subtasksList;
                    }
                } else {
                    // Произвольная задача - название + все заполненные поля в табличном формате
                    const lines = [];
                    lines.push(task.taskName); // Заголовок
                    lines.push(''); // Пустая строка

                    if (task.department) lines.push(`Отдел:\t${task.department}`);
                    if (domain) lines.push(`Домен:\t${domain}`);
                    if (oldSub) lines.push(`Старый поддомен:\t${oldSub}`);
                    if (newSub) lines.push(`Новый поддомен:\t${newSub}`);
                    if (alternateDomain) lines.push(`Домен подмены:\t${alternateDomain}`);
                    // v4.5.6: Новые поля
                    if (task.toUrl) lines.push(`URL дропа:\t${task.toUrl}`);
                    // v4.6.10: oldUrl с разделением по типам
                    if (task.oldUrl) {
                        const parsed = parseOldUrls(task.oldUrl);
                        if (parsed.urls404.length > 0) {
                            lines.push(`URL для 404:\n${parsed.urls404.join('\n')}`);
                        }
                        if (parsed.urls301.length > 0) {
                            lines.push(`URL для 301:\n${parsed.urls301.join('\n')}`);
                        }
                    }
                    if (task.templateIndex !== '' && task.templateIndex !== undefined) {
                        const tpl = templates[task.templateIndex];
                        if (tpl && hreflangCode) {
                            lines.push(`hreflang:\t${tpl.name}`);
                            lines.push('');
                            lines.push(hreflangCode);
                        } else if (tpl) {
                            lines.push(`hreflang:\t${tpl.name}`);
                        }
                    }
                    if (task.redirect301) lines.push(`301 редирект:\tДа`);
                    if (task.redirect404) lines.push(`404:\tДа`);
                    if (task.priority) lines.push(`Приоритет:\t${task.priority}`);
                    if (task.cms) lines.push(`CMS:\t${task.cms}`);
                    if (task.dmca) lines.push(`DMCA:\tДа`);
                    if (task.amp) { const ampText = formatAmpText(task.amp, domain, newSub); if (ampText) lines.push(`AMP:\t${ampText}`); }
                    if (assigneeName) lines.push(`Ответственный:\t${assigneeName}`);
                    if (task.notes) lines.push(`Примечания:\t${task.notes}`);

                    // v4.5.2: Подзадачи с полной информацией
                    const subtasksList = (task.subtasks || [])
                        .filter(s => s.name && s.name.trim())
                        .map(s => {
                            let line = s.name;
                            const meta = [];
                            if (s.priority) meta.push(s.priority);
                            if (s.allocation) meta.push(s.allocation + '%');
                            if (s.assignee && rocketMapping[s.assignee]) {
                                const data = rocketMapping[s.assignee];
                                const name = typeof data === 'object' ? (data.asanaName || data.name) : data;
                                meta.push(name);
                            }
                            if (meta.length > 0) line += '\t' + meta.join(' | ');
                            return line;
                        });
                    if (subtasksList.length > 0) {
                        lines.push('');
                        lines.push('Подзадачи:');
                        subtasksList.forEach(s => lines.push(`•\t${s}`));
                    }

                    tzContent = lines.join('\n');
                }

                // Добавляем дополнительные поля только для типов из списка
                if (matchedType) {
                    const additionalInfo = [];
                    if (task.redirect301) additionalInfo.push('301 редирект: Да');
                    if (task.redirect404) additionalInfo.push('404 ошибка: Да');
                    if (task.dmca) additionalInfo.push('DMCA: Да');
                    if (task.amp) { const ampText = formatAmpText(task.amp, domain, newSub); if (ampText) additionalInfo.push('AMP: ' + ampText); }
                    if (task.priority) additionalInfo.push('Приоритет: ' + task.priority);
                    if (task.cms) additionalInfo.push('CMS: ' + task.cms);
                    if (assigneeName) additionalInfo.push('Ответственный: ' + assigneeName);

                    if (additionalInfo.length > 0) {
                        tzContent += '\n\n--- Дополнительно ---\n' + additionalInfo.join('\n');
                    }
                }

                // v4.5.2: Формируем имя в формате: домен - задача [ответственный]
                // Если домен не заполнен (или это просто номер), используем только название задачи
                const identifier = domain || newSub || oldSub || alternateDomain || '';
                const taskLabel = task.taskName || 'задача';

                let sheetName;
                if (identifier && !/^\d+$/.test(identifier)) {
                    // Есть реальный домен/поддомен
                    sheetName = `${identifier} - ${taskLabel}`;
                } else {
                    // Только название задачи
                    sheetName = taskLabel;
                }

                if (assigneeName) {
                    sheetName += ` [${assigneeName}]`;
                }

                return {
                    sheetName: sheetName,
                    taskName: task.taskName,
                    domain: domain,
                    oldSub: oldSub,
                    newSub: newSub,
                    department: task.department,
                    assignee: assigneeName,
                    priority: task.priority,
                    tzContent: tzContent
                };
            });
        }

        // Отправка в Google Sheets через Apps Script
        async sendToGoogleSheets(scriptUrl, data) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: scriptUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ tasks: data }),
                    timeout: 120000,  // v4.5.5: 2 минуты таймаут
                    onload: (response) => {
                        if(DEBUG) console.log('Google response:', response.status, response.responseText?.substring(0, 500));

                        // Проверяем статус
                        if (response.status === 0) {
                            reject(new Error('Нет ответа от сервера. Проверьте URL и доступ.'));
                            return;
                        }

                        if (response.status === 401 || response.status === 403) {
                            reject(new Error('Ошибка авторизации. Проверьте настройки Web App: "Who has access: Anyone"'));
                            return;
                        }

                        if (response.status >= 400) {
                            reject(new Error(`HTTP ошибка ${response.status}`));
                            return;
                        }

                        try {
                            const result = JSON.parse(response.responseText);
                            if (result.error) {
                                reject(new Error(result.error));
                            } else {
                                resolve(result);
                            }
                        } catch (e) {
                            // Показываем начало ответа для диагностики
                            const preview = response.responseText?.substring(0, 100) || 'пустой ответ';
                            if (response.responseText?.includes('<!DOCTYPE') || response.responseText?.includes('<html')) {
                                reject(new Error('Google вернул HTML вместо JSON.\n\nПроверьте:\n1. URL скопирован полностью\n2. Web App опубликован\n3. "Execute as: Me"\n4. "Who has access: Anyone"'));
                            } else {
                                reject(new Error(`Некорректный ответ: ${preview}...`));
                            }
                        }
                    },
                    onerror: (err) => {
                        if(DEBUG) console.log('Google error:', err);
                        reject(new Error('Сетевая ошибка. Проверьте подключение к интернету.'));
                    },
                    ontimeout: () => {
                        reject(new Error('Таймаут запроса. Попробуйте ещё раз.'));
                    }
                });
            });
        }

        // v4.5.0: Отправка в Microsoft Excel через Power Automate
        async sendToPowerAutomate(webhookUrl, data) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: webhookUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        tasks: data,
                        timestamp: new Date().toISOString(),
                        filename: `TZ_${new Date().toISOString().split('T')[0]}.xlsx`
                    }),
                    onload: (response) => {
                        try {
                            // Power Automate может вернуть разные форматы
                            if (response.status >= 200 && response.status < 300) {
                                let result;
                                try {
                                    result = JSON.parse(response.responseText);
                                } catch (e) {
                                    // Если не JSON, пробуем извлечь URL из текста
                                    const urlMatch = response.responseText.match(/https:\/\/[^\s"'<>]+/);
                                    result = {
                                        success: true,
                                        sheetUrl: urlMatch ? urlMatch[0] : null,
                                        message: response.responseText
                                    };
                                }

                                // Если URL не пришёл, делаем успех без URL
                                if (!result.sheetUrl && result.success !== false) {
                                    result.success = true;
                                    result.sheetUrl = 'https://onedrive.live.com'; // Fallback
                                    result.message = 'Файл создан в OneDrive (откройте вручную)';
                                }

                                resolve(result);
                            } else {
                                reject(new Error(`HTTP ${response.status}: ${response.responseText}`));
                            }
                        } catch (e) {
                            reject(new Error('Ошибка парсинга ответа от Power Automate'));
                        }
                    },
                    onerror: () => reject(new Error('Сетевая ошибка при отправке в Power Automate'))
                });
            });
        }

        // Отправка пинга в Rocket.Chat
        async sendRocketPing(username, task, sheetUrl) {
            // v4.5.0: Сначала проверяем сохранённый URL, потом CONFIG
            const webhookUrl = GM_getValue('rocketWebhookUrl', '') || CONFIG.rocketChat?.webhookUrl;
            if (!webhookUrl) {
                throw new Error('Webhook URL не настроен (🔧 → Облако)');
            }

            const message = `📋 *Новое ТЗ*\n` +
                `*Задача:* ${task.taskName || 'Без названия'}\n` +
                `*Домен:* ${task.domain}\n` +
                `${task.oldSub ? `*Старый:* ${task.oldSub}\n` : ''}` +
                `${task.newSub ? `*Новый:* ${task.newSub}\n` : ''}` +
                `🔗 [Открыть ТЗ](${sheetUrl})`;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: webhookUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        channel: `@${username}`,
                        text: message
                    }),
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve();
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Сетевая ошибка'))
                });
            });
        }

        // v4.5.0: Открыть объединённое модальное окно настроек
        openUnifiedSettingsModal() {
            const modal = new FieldConfigModal(this.shadowRoot, () => {
                this.renderTasksTable();
            });
            modal.show();
        }

        // ===== МАССОВЫЙ РЕЖИМ: УПРАВЛЕНИЕ ЗАДАЧАМИ =====
        addTask() {
            if(DEBUG) console.log('addTask вызван');
            const templates = loadTemplates();

            // v4.5.2: Собираем закреплённые подзадачи из всех отделов
            const subtaskTemplates = loadSubtaskTemplates();
            const pinnedSubtasks = [];
            Object.values(subtaskTemplates).forEach(deptTemplates => {
                if (Array.isArray(deptTemplates)) {
                    deptTemplates.forEach(t => {
                        if (t.pinned) {
                            pinnedSubtasks.push({
                                name: t.name,
                                priority: t.priority || 'medium',
                                allocation: t.allocation || 1,
                                assignee: t.assignee || ''
                            });
                        }
                    });
                }
            });

            this.tasks.push({
                id: this.taskIdCounter++,
                taskName: '',  // v4.5.0: пустое по умолчанию
                department: '',
                domain: '',
                oldSub: '',
                redirect301: false,
                redirect404: false,
                newSub: '',
                alternateDomain: '',  // v4.5.0: домен подмены
                toUrl: '',  // v4.5.7: URL дропа (301/404)
                oldUrl: '',  // v4.5.7: URL для 404 (несколько)
                templateIndex: '',  // v4.5.0: пустое по умолчанию (—)
                priority: '',
                cms: '',
                dmca: false,
                amp: '',  // v4.6.17: select вместо checkbox
                assignee: '',  // v4.5.0: ответственный (gid из Asana)
                pingRocket: false,  // v4.5.0: пинг в Rocket.Chat
                notes: '',  // v4.5.0: примечания
                subtasks: pinnedSubtasks  // v4.5.2: автодобавление закреплённых
            });
            if(DEBUG) console.log('Задача добавлена, всего:', this.tasks.length, 'с подзадачами:', pinnedSubtasks.length);
            this.renderTasksTable();
            this.updateTasksCount();
        }

        removeTask(taskId) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.renderTasksTable();
            this.updateTasksCount();
        }

        duplicateTask(taskId) {
            const orig = this.tasks.find(t => t.id === taskId);
            if (!orig) return;
            const newTask = { ...JSON.parse(JSON.stringify(orig)), id: this.taskIdCounter++ };
            const idx = this.tasks.findIndex(t => t.id === taskId);
            this.tasks.splice(idx + 1, 0, newTask);
            this.renderTasksTable();
            this.updateTasksCount();
        }

        clearAllTasks() {
            if (!this.tasks.length) return;
            // Удаляем без подтверждения, т.к. браузерный confirm может быть заблокирован
            this.tasks = [];
            this.taskIdCounter = 1;  // v4.5.5: сброс счётчика
            this.renderTasksTable();
            this.updateTasksCount();
            showToast('🗑️ Таблица очищена', 'info', 2000);
        }

        // v4.5.2: Получить ID выбранных задач
        getSelectedTaskIds() {
            const checkboxes = this.shadowRoot.querySelectorAll('.task-select-checkbox:checked');
            return Array.from(checkboxes).map(cb => parseInt(cb.dataset.taskId));
        }

        // v4.5.2: Получить выбранные задачи (пустой массив если ничего не выбрано)
        getSelectedTasks() {
            const selectedIds = this.getSelectedTaskIds();
            if (selectedIds.length === 0) {
                return []; // Если ничего не выбрано - возвращаем пустой массив
            }
            return this.tasks.filter(t => selectedIds.includes(t.id));
        }

        // v4.5.2: Обновить счётчик выбранных
        updateSelectedCount() {
            const selectedIds = this.getSelectedTaskIds();
            const countSpan = this.shadowRoot.getElementById('selected-tasks-count');
            if (countSpan) {
                countSpan.textContent = selectedIds.length > 0 ? `(${selectedIds.length})` : '';
            }
        }

        // v4.5.2: Удалить только выбранные задачи
        clearSelectedTasks() {
            const selectedIds = this.getSelectedTaskIds();
            if (selectedIds.length === 0) {
                showToast('⚠️ Выберите задачи для удаления', 'warning');
                return;
            }
            this.tasks = this.tasks.filter(t => !selectedIds.includes(t.id));
            this.renderTasksTable();
            this.updateTasksCount();
            showToast(`🗑️ Удалено задач: ${selectedIds.length}`, 'success');
        }

        updateTasksCount() {
            const span = this.shadowRoot.getElementById('tasks-count');
            if (span) span.textContent = this.tasks.length;
        }

        updateTaskField(taskId, field, value) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) task[field] = value;
        }

        renderTasksTable() {
            if(PROFILE) console.time('renderTasksTable');
            const container = this.shadowRoot.getElementById('tasks-table-container');
            if (!container) { if(PROFILE) console.timeEnd('renderTasksTable'); return; }

            if (!this.tasks.length) {
                container.innerHTML = `
                    <div class="empty-table">
                        📋 Нет задач<br>
                        <span style="font-size: 13px; color: #bbb; margin-top: 8px; display: block;">
                            Нажмите "➕ Добавить задачу" для начала
                        </span>
                    </div>
                `;
                if(PROFILE) console.timeEnd('renderTasksTable');
                return;
            }

            if(PROFILE) console.time('  loadTemplates');
            const templates = loadTemplates();
            if(PROFILE) console.timeEnd('  loadTemplates');

            if(PROFILE) console.time('  loadRocketChatMapping');
            const rocketMapping = loadRocketChatMapping();
            if(PROFILE) console.timeEnd('  loadRocketChatMapping');

            if(PROFILE) console.time('  loadTaskTypes');
            const taskTypes = loadTaskTypes();
            if(PROFILE) console.timeEnd('  loadTaskTypes');

            // v4.5.2 PERF: Загружаем базу один раз для всех задач
            if(PROFILE) console.time('  loadSitesDatabase');
            const sitesDb = loadSitesDatabase();
            if(PROFILE) console.timeEnd('  loadSitesDatabase');

            // v4.5.0: Собираем обязательные поля из всех шаблонов задач в таблице
            const requiredFields = new Set(); // Только из шаблонов

            this.tasks.forEach(task => {
                // Определяем тип задачи
                let taskTypeId = 'subdomain';
                const taskTypesArr = Object.values(taskTypes);
                const matchedType = taskTypesArr.find(t => t.name === task.taskName);
                if (matchedType) taskTypeId = matchedType.id;

                const taskType = taskTypes[taskTypeId] || DEFAULT_TASK_TYPES['subdomain'];
                const tzTemplate = taskType?.tzTemplate || '';

                // Извлекаем переменные из шаблона
                const matches = tzTemplate.match(/\{\{(\w+)\}\}/g) || [];
                matches.forEach(m => {
                    const varName = m.replace(/\{\{|\}\}/g, '');
                    requiredFields.add(varName);
                });
            });

            // Маппинг переменных к колонкам
            const fieldToColumn = {
                'taskName': 'Задача',
                'department': 'Отдел',
                'domain': 'Домен',
                'oldSub': 'Старый поддомен',
                'newSub': 'Новый поддомен',
                'toUrl': 'URL дропа (301/404)',
                'oldUrl': 'oldURL',
                'alternateDomain': 'Подмена',
                'hreflangCode': 'hreflang',
                'priority': 'Приоритет',
                'cms': 'CMS',
                'assignee': 'Ответственный'
            };

            // Функция добавления звёздочки
            // v4.6.17: oldSub не отмечается как обязательное
            const mark = (field, label) => {
                if (field === 'oldSub') return label; // oldSub всегда необязательный
                return requiredFields.has(field)
                    ? `${label}<span class="required-mark">*</span>`
                    : label;
            };

            container.innerHTML = `
                <div class="tasks-table">
                    <div class="table-header">
                        <div class="cell-checkbox-all"><input type="checkbox" id="select-all-tasks" title="Выбрать все"></div>
                        <div>#</div>
                        <div>${mark('taskName', 'Задача')}</div>
                        <div>${mark('department', 'Отдел')}</div>
                        <div>${mark('domain', 'Домен')}</div>
                        <div>${mark('oldSub', 'Старый поддомен')}</div>
                        <div>${mark('newSub', 'Новый поддомен')}</div>
                        <div>${mark('toUrl', 'URL дропа (301/404)')}</div>
                        <div>${mark('oldUrl', 'oldURL')}</div>
                        <div>${mark('alternateDomain', 'Подмена')}</div>
                        <div>${mark('hreflangCode', 'hreflang')}</div>
                        <div>${mark('priority', 'Приоритет')}</div>
                        <div>${mark('cms', 'CMS')}</div>
                        <div>DMCA</div>
                        <div>AMP</div>
                        <div>${mark('assignee', 'Ответственный')}</div>
                        <div>Пинг</div>
                        <div>Подзад.</div>
                        <div>Действия</div>
                    </div>
                    <div class="table-body">
                        ${this.tasks.map((task, i) => this.renderTaskRow(task, i, templates, rocketMapping, taskTypes, sitesDb)).join('')}
                    </div>
                </div>
            `;
            this.attachTableEventListeners();
            if(PROFILE) console.timeEnd('renderTasksTable');
        }

        renderTaskRow(task, index, templates, rocketMapping = {}, taskTypes = null, sitesDb = null) {
            // v4.5.2 PERF: Используем переданные данные вместо повторной загрузки
            if (!taskTypes) taskTypes = loadTaskTypes();
            if (!sitesDb) sitesDb = loadSitesDatabase();

            const taskTypesArr = Object.values(taskTypes);
            const matchedType = taskTypesArr.find(t => t.name === task.taskName);

            // Извлекаем обязательные переменные из шаблона ТОЛЬКО для известных типов
            const requiredVars = new Set();
            if (matchedType) {
                const taskType = taskTypes[matchedType.id];
                const tzTemplate = taskType?.tzTemplate || '';
                const matches = tzTemplate.match(/\{\{(\w+)\}\}/g) || [];
                matches.forEach(m => {
                    const varName = m.replace(/\{\{|\}\}/g, '');
                    requiredVars.add(varName);
                });
                if(DEBUG) console.log('renderTaskRow requiredVars для', task.taskName, ':', [...requiredVars]);
            }

            // Функция проверки пустого обязательного поля
            const isRequiredEmpty = (fieldName, value) => {
                if (!requiredVars.has(fieldName)) return false;
                const cleanValue = value ? value.toString().trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';
                return !cleanValue;
            };

            // v4.5.2: Валидация - красная рамка ТОЛЬКО при www-mismatch (несовпадение www)
            const domainVal = validateWithDatabase('domain', '', task.domain, sitesDb);
            let domainInputClass = domainVal.status === 'valid' ? 'input-valid' :
                                    (domainVal.status === 'www-mismatch' ? 'input-error' : '');
            if (isRequiredEmpty('domain', task.domain)) domainInputClass += ' input-required-empty';
            const domainTitle = domainVal.message || '';

            const oldSubVal = validateWithDatabase('oldSub', task.domain, task.oldSub, sitesDb);
            let oldSubInputClass = oldSubVal.status === 'valid' ? 'input-valid' :
                                    (oldSubVal.status === 'www-mismatch' ? 'input-error' : '');
            if (isRequiredEmpty('oldSub', task.oldSub)) oldSubInputClass += ' input-required-empty';
            const oldSubTitle = oldSubVal.message || '';

            const newSubVal = validateWithDatabase('newSub', task.domain, task.newSub, sitesDb);
            let newSubInputClass = newSubVal.status === 'valid' ? 'input-valid' :
                                    (newSubVal.status === 'www-mismatch' ? 'input-error' : '');
            if (isRequiredEmpty('newSub', task.newSub)) newSubInputClass += ' input-required-empty';
            const newSubTitle = newSubVal.message || '';

            // v4.5.2: Проверяем все остальные поля из шаблона
            const taskNameClass = '';  // taskName не подсвечиваем - это поле выбора типа
            const departmentClass = isRequiredEmpty('department', task.department) ? 'input-required-empty' : '';
            const alternateDomainClass = isRequiredEmpty('alternateDomain', task.alternateDomain) ? 'input-required-empty' : '';
            // v4.6.0: Классы для новых полей
            const toUrlClass = isRequiredEmpty('toUrl', task.toUrl) ? 'input-required-empty' : '';
            const oldUrlClass = isRequiredEmpty('oldUrl', task.oldUrl) ? 'input-required-empty' : '';
            if(DEBUG && (toUrlClass || oldUrlClass || alternateDomainClass)) {
                console.log('Подсветка полей:', { toUrlClass, oldUrlClass, alternateDomainClass, requiredVars: [...requiredVars] });
            }
            const hreflangClass = isRequiredEmpty('hreflangCode', task.templateIndex) ? 'input-required-empty' : '';
            const priorityClass = isRequiredEmpty('priority', task.priority) ? 'input-required-empty' : '';
            const cmsClass = isRequiredEmpty('cms', task.cms) ? 'input-required-empty' : '';
            const assigneeClass = isRequiredEmpty('assignee', task.assignee) ? 'input-required-empty' : '';

            return `
                <div class="task-row" data-task-id="${task.id}">
                    <div class="cell-checkbox"><input type="checkbox" class="task-select-checkbox" data-task-id="${task.id}"></div>
                    <div class="cell-num">${index + 1}</div>
                    <div class="cell-task">
                        <div class="cell-task-wrapper">
                            <input type="text"
                                   list="${matchedType ? '' : 'task-types-list-' + task.id}"
                                   value="${task.taskName}"
                                   data-field="taskName"
                                   class="${taskNameClass}"
                                   placeholder="Выберите или введите"
                                   ${matchedType ? 'readonly' : ''}
                                   autocomplete="off" />
                            ${task.taskName ? '<span class="task-clear-btn" data-action="clear-task-type" title="Сбросить тип задачи">×</span>' : ''}
                        </div>
                        <datalist id="task-types-list-${task.id}">
                            ${Object.values(loadTaskTypes()).map(t => `<option value="${t.name}">${t.icon} ${t.name}</option>`).join('')}
                        </datalist>
                    </div>
                    <div class="cell-department">
                        <select data-field="department" class="${departmentClass}">
                            <option value="">—</option>
                            ${getDepartmentsList().map(d => `<option value="${d}" ${task.department === d ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cell-domain">
                        <div class="cell-with-btn" style="position: relative;">
                            <input type="text" value="${task.domain}" data-field="domain" class="${domainInputClass}" title="${domainTitle}" autocomplete="off" />
                            <span class="cell-settings-btn" data-action="manage-domains" title="Управление доменами">🗂️</span>
                            <div class="autocomplete-list" id="domain-autocomplete-${task.id}"></div>
                        </div>
                    </div>
                    <div class="cell-oldsub">
                        <div class="cell-with-btn" style="position: relative;">
                            <input type="text" value="${task.oldSub}" data-field="oldSub" class="${oldSubInputClass}" title="${oldSubTitle}" autocomplete="off" />
                            <span class="cell-settings-btn" data-action="manage-history" title="Управление историей">📜</span>
                            <div class="autocomplete-list" id="oldSub-autocomplete-${task.id}"></div>
                        </div>
                        <div class="redirect-checkboxes">
                            <label><input type="checkbox" data-field="redirect301" ${task.redirect301 ? 'checked' : ''} /> 301</label>
                            <label><input type="checkbox" data-field="redirect404" ${task.redirect404 ? 'checked' : ''} /> 404</label>
                        </div>
                    </div>
                    <div class="cell-newsub" style="position: relative;">
                        <input type="text" value="${task.newSub}" data-field="newSub" class="${newSubInputClass}" title="${newSubTitle}" autocomplete="off" />
                        <div class="autocomplete-list" id="newSub-autocomplete-${task.id}"></div>
                    </div>
                    <div class="cell-tourl">
                        <input type="text" value="${task.toUrl || ''}" data-field="toUrl" class="${toUrlClass}" placeholder="URL дропа (301/404)" autocomplete="off" />
                    </div>
                    <div class="cell-oldurl">
                        ${this.getOldUrlCountBadge(task.oldUrl)}
                    </div>
                    <div class="cell-altdomain">
                        <input type="text" value="${task.alternateDomain || ''}" data-field="alternateDomain" class="${alternateDomainClass}" placeholder="" autocomplete="off" />
                    </div>
                    <div class="cell-template">
                        <div class="cell-with-btn">
                            <select data-field="templateIndex" class="${hreflangClass}">
                                <option value="">—</option>
                                ${templates.map((t, i) => `<option value="${i}" ${task.templateIndex !== '' && i == task.templateIndex ? 'selected' : ''}>${t.name}</option>`).join('')}
                            </select>
                            <span class="cell-settings-btn" data-action="manage-templates" title="Управление шаблонами">🏷️</span>
                        </div>
                    </div>
                    <div class="cell-priority">
                        <select data-field="priority" class="${priorityClass}">
                            <option value="">—</option>
                            <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                            <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                        </select>
                    </div>
                    <div class="cell-cms">
                        <select data-field="cms" class="${cmsClass}">
                            <option value="">—</option>
                            ${getCmsList().map(c => `<option value="${c.key}" ${task.cms === c.key ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cell-dmca"><input type="checkbox" data-field="dmca" ${task.dmca ? 'checked' : ''} /></div>
                    <div class="cell-amp">
                        <select data-field="amp">
                            <option value="" ${!task.amp ? 'selected' : ''}>—</option>
                            <option value="domain" ${task.amp === 'domain' ? 'selected' : ''}>Домен</option>
                            <option value="subdomain" ${task.amp === 'subdomain' ? 'selected' : ''}>Поддомен</option>
                            <option value="both" ${task.amp === 'both' ? 'selected' : ''}>Оба</option>
                        </select>
                    </div>
                    <div class="cell-assignee">
                        <select data-field="assignee" class="${assigneeClass}">
                            <option value="">—</option>
                            ${Object.entries(rocketMapping).map(([gid, data]) => {
                                const name = typeof data === 'object' ? data.name : data;
                                const displayName = typeof data === 'object' ? data.asanaName || name : name;
                                return `<option value="${gid}" ${task.assignee === gid ? 'selected' : ''}>${displayName}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="cell-ping">
                        <label class="toggle-switch" title="Отправить уведомление в Rocket.Chat при облачном сохранении">
                            <input type="checkbox" data-field="pingRocket" ${task.pingRocket ? 'checked' : ''} />
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="cell-subtasks">
                        <span class="icon-btn" data-action="edit-subtasks" title="Редактировать подзадачи">📋</span>
                        <span class="subtasks-count ${task.subtasks.length === 0 ? 'empty' : ''}" ${task.subtasks.length > 0 ? 'data-action="view-subtasks"' : ''} data-tooltip="${this.getSubtasksTooltip(task)}" ${task.subtasks.length > 0 ? 'title="Нажмите для просмотра"' : ''}>${task.subtasks.length}</span>
                    </div>
                    <div class="cell-actions">
                        <span class="icon-btn-duplicate" data-action="duplicate" title="Дублировать задачу">⧉</span>
                        <span class="icon-btn-delete" data-action="delete" title="Удалить">🗑️</span>
                    </div>
                </div>
            `;
        }

        getDomainOptions() {
            const db = loadSitesDatabase();
            return Object.keys(db)
                .filter(d => db[d].status === 'active')
                .map(d => `<option value="${d}">`)
                .join('');
        }

        // v4.6.11: Счётчик oldUrl с типами
        getOldUrlCountBadge(oldUrlField) {
            const parsed = parseOldUrls(oldUrlField);
            const total = parsed.all.length;
            
            if (total === 0) {
                return '<span class="oldurl-count empty" data-action="manage-oldurl" data-tooltip="Нет URL&#10;Нажмите чтобы добавить" title="Управление oldURL">📜 0</span>';
            }
            
            // v4.6.12: Детальный tooltip со списком URL
            const lines = [];
            if (parsed.urls404.length > 0) {
                lines.push(`🔴 404 (${parsed.urls404.length}):`);
                parsed.urls404.slice(0, 5).forEach(url => {
                    const shortUrl = url.length > 35 ? url.substring(0, 35) + '...' : url;
                    lines.push(`  ${shortUrl}`);
                });
                if (parsed.urls404.length > 5) lines.push(`  ... и ещё ${parsed.urls404.length - 5}`);
            }
            if (parsed.urls301.length > 0) {
                if (lines.length > 0) lines.push('');
                lines.push(`🔵 301 (${parsed.urls301.length}):`);
                parsed.urls301.slice(0, 5).forEach(url => {
                    const shortUrl = url.length > 35 ? url.substring(0, 35) + '...' : url;
                    lines.push(`  ${shortUrl}`);
                });
                if (parsed.urls301.length > 5) lines.push(`  ... и ещё ${parsed.urls301.length - 5}`);
            }
            const tooltip = lines.join('&#10;');
            
            return `<span class="oldurl-count" data-action="manage-oldurl" data-tooltip="${tooltip}" title="Управление oldURL">📜 ${total}</span>`;
        }

        getSubtasksTooltip(task) {
            if (!task.subtasks || task.subtasks.length === 0) {
                return 'Нет подзадач';
            }
            const lines = task.subtasks.map((s, i) => {
                const priority = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🟢';
                // v4.3.7: Экранируем кавычки для data-tooltip
                const safeName = (s.name || '').replace(/"/g, '&quot;');
                return `${i + 1}. ${priority} ${safeName}`;
            });
            return lines.join('&#10;');  // v4.3.7: перенос строки в атрибуте
        }

        // v4.3.6: Сокращение текста для мини-превью
        truncateText(text, maxLength) {
            if (!text) return '';
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '…';
        }

        getHistoryOptions(domain) {
            if (!domain) return '';
            const history = getSubdomainHistory(domain);
            return history.map(sub => `<option value="${sub}">`).join('');
        }

        // FIX v4.1.9: Получить все старые поддомены из базы для автокомплита
        getOldSubOptionsFromDatabase(domain) {
            if (!domain) return '';
            const db = loadSitesDatabase();
            const normalized = normalizeDomain(domain);

            // Ищем домен в базе
            let site = db[domain];
            if (!site) {
                for (const d in db) {
                    if (normalizeDomain(d) === normalized) {
                        site = db[d];
                        break;
                    }
                }
            }

            if (!site || !site.oldSubdomains || site.oldSubdomains.length === 0) {
                return '';
            }

            return site.oldSubdomains.map(s => `<option value="${s.url}" data-action="${s.action}">`).join('');
        }

        // FIX v4.1.9: Проверка oldSub с базой (www, наличие в истории)
        validateOldSubWithDatabase(domain, oldSub) {
            if (!domain || !oldSub) return { valid: true, inHistory: false };

            const db = loadSitesDatabase();
            const normalized = normalizeDomain(domain);

            let site = db[domain];
            if (!site) {
                for (const d in db) {
                    if (normalizeDomain(d) === normalized) {
                        site = db[d];
                        break;
                    }
                }
            }

            if (!site || !site.oldSubdomains) {
                return { valid: true, inHistory: false, message: 'Новый поддомен (не в истории)' };
            }

            const normalizedOldSub = normalizeDomain(oldSub);
            const found = site.oldSubdomains.find(s => normalizeDomain(s.url) === normalizedOldSub);

            if (found) {
                // Проверяем www
                const inputHasWww = oldSub.toLowerCase().replace(/^https?:\/\//, '').startsWith('www.');
                const dbHasWww = found.url.toLowerCase().replace(/^https?:\/\//, '').startsWith('www.');

                if (inputHasWww !== dbHasWww) {
                    return {
                        valid: true,
                        inHistory: true,
                        wwwMismatch: true,
                        dbValue: found.url,
                        action: found.action,
                        message: `В базе: ${found.url} (${dbHasWww ? 'с www' : 'без www'})`
                    };
                }

                return {
                    valid: true,
                    inHistory: true,
                    exactMatch: true,
                    dbValue: found.url,
                    action: found.action,
                    message: `Найден в истории (action: ${found.action})`
                };
            }

            return { valid: true, inHistory: false, message: 'Новый поддомен (не в истории)' };
        }

        // FIX v4.1.5: Список новых поддоменов для автокомплита
        getNewSubOptions(domain) {
            if (!domain) return '';
            const db = loadSitesDatabase();
            const site = db[normalizeDomain(domain)] || db[domain];
            if (!site || !site.currentSubdomain) return '';
            // Показываем текущий поддомен как подсказку
            return `<option value="${site.currentSubdomain}">`;
        }

        // FIX v4.1.7: Валидация домена в массовом режиме
        validateDomainInMassMode(domain) {
            if (!domain) return { valid: false, inDatabase: false, message: '' };

            const db = loadSitesDatabase();
            const normalized = normalizeDomain(domain);

            // Точное совпадение
            if (db[domain] && db[domain].status === 'active') {
                return { valid: true, inDatabase: true, exactMatch: true, dbDomain: domain };
            }

            // Поиск с нормализацией (www, без www)
            for (const dbDomain in db) {
                if (db[dbDomain].status !== 'active') continue;
                if (normalizeDomain(dbDomain) === normalized) {
                    // Найден, но www отличается
                    const inputHasWww = domain.toLowerCase().startsWith('www.');
                    const dbHasWww = dbDomain.toLowerCase().startsWith('www.');
                    if (inputHasWww !== dbHasWww) {
                        return {
                            valid: true,
                            inDatabase: true,
                            exactMatch: false,
                            dbDomain: dbDomain,
                            wwwMismatch: true,
                            message: `В базе: ${dbDomain} (${dbHasWww ? 'с www' : 'без www'})`
                        };
                    }
                    return { valid: true, inDatabase: true, exactMatch: true, dbDomain: dbDomain };
                }
            }

            // Не найден в базе
            return { valid: false, inDatabase: false, message: 'Домен не найден в базе!' };
        }

        // FIX v4.1.6: Проверка newSub с базой (www, протокол)
        validateNewSubWithDatabase(domain, newSub) {
            if (!domain || !newSub) return { valid: true };

            const db = loadSitesDatabase();
            const site = db[normalizeDomain(domain)] || db[domain];
            if (!site || !site.currentSubdomain) return { valid: true };

            const dbSub = site.currentSubdomain;

            const getProtocol = (url) => {
                if (url.startsWith('https://')) return 'https';
                if (url.startsWith('http://')) return 'http';
                return '';
            };

            const hasWww = (url) => {
                return url.replace(/^https?:\/\//, '').startsWith('www.');
            };

            const dbProtocol = getProtocol(dbSub);
            const newProtocol = getProtocol(newSub);
            const dbHasWww = hasWww(dbSub);
            const newHasWww = hasWww(newSub);

            const warnings = [];

            if (dbProtocol && newProtocol && dbProtocol !== newProtocol) {
                warnings.push(`Протокол: база ${dbProtocol}, введено ${newProtocol}`);
            }

            if (dbHasWww !== newHasWww) {
                warnings.push(`WWW: база ${dbHasWww ? 'с www' : 'без www'}, введено ${newHasWww ? 'с www' : 'без www'}`);
            }

            return {
                valid: warnings.length === 0,
                warnings: warnings,
                dbValue: dbSub
            };
        }

        // Конвертирует имя исполнителя в GID или возвращает как есть если уже GID
        resolveAssignee(value) {
            if (!value) return '';
            // Если это уже числовой GID - возвращаем как есть
            if (/^\d+$/.test(value)) return value;
            // Ищем по имени в кеше
            const cache = loadTeamMembersFromCache();
            if (cache.data && cache.data.length > 0) {
                const member = cache.data.find(m =>
                    m.name && m.name.toLowerCase() === value.toLowerCase()
                );
                if (member) return member.gid;
            }
            // Не нашли - возвращаем пустую строку
            console.warn(`Исполнитель "${value}" не найден в кеше Asana`);
            return '';
        }

        attachTableEventListeners() {
            const table = this.shadowRoot.querySelector('.tasks-table');
            if (!table) return;

            // v4.5.2: Чекбокс "выбрать все"
            const selectAllCheckbox = this.shadowRoot.getElementById('select-all-tasks');
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    table.querySelectorAll('.task-select-checkbox').forEach(cb => {
                        cb.checked = isChecked;
                    });
                    this.updateSelectedCount();
                });
            }

            // v4.5.2: Обработчик для индивидуальных чекбоксов
            table.querySelectorAll('.task-select-checkbox').forEach(cb => {
                cb.addEventListener('change', () => {
                    this.updateSelectedCount();
                    // Обновляем состояние "выбрать все"
                    const allCheckboxes = table.querySelectorAll('.task-select-checkbox');
                    const checkedCount = table.querySelectorAll('.task-select-checkbox:checked').length;
                    if (selectAllCheckbox) {
                        selectAllCheckbox.checked = checkedCount === allCheckboxes.length;
                        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
                    }
                });
            });

            table.querySelectorAll('input[data-field], select[data-field], textarea[data-field]').forEach(el => {
                // Предотвращаем всплытие событий к Asana
                el.addEventListener('keydown', (e) => e.stopPropagation());
                el.addEventListener('keyup', (e) => e.stopPropagation());
                el.addEventListener('input', (e) => {
                    e.stopPropagation();
                    const row = e.target.closest('.task-row');
                    const taskId = parseInt(row.dataset.taskId);
                    const field = e.target.dataset.field;

                    // v4.3.0: Показываем автокомплит при вводе
                    if (field === 'domain' || field === 'oldSub' || field === 'newSub') {
                        this.showMassAutocomplete(taskId, field);
                    }
                });

                // v4.3.0: Показываем автокомплит при фокусе
                el.addEventListener('focus', (e) => {
                    e.stopPropagation();
                    const row = e.target.closest('.task-row');
                    const taskId = parseInt(row.dataset.taskId);
                    const field = e.target.dataset.field;

                    if (field === 'domain' || field === 'oldSub' || field === 'newSub') {
                        this.showMassAutocomplete(taskId, field);
                    }
                });

                // v4.3.0: Скрываем автокомплит при blur
                el.addEventListener('blur', (e) => {
                    e.stopPropagation();
                    const row = e.target.closest('.task-row');
                    const taskId = parseInt(row.dataset.taskId);
                    const field = e.target.dataset.field;

                    if (field === 'domain' || field === 'oldSub' || field === 'newSub') {
                        setTimeout(() => this.hideMassAutocomplete(taskId, field), 200);
                    }
                });

                el.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const row = e.target.closest('.task-row');
                    const taskId = parseInt(row.dataset.taskId);
                    const field = e.target.dataset.field;
                    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

                    this.updateTaskField(taskId, field, value);

                    // v4.5.2: При выборе типа задачи - перерендерить строку для обновления индикации
                    if (field === 'taskName') {
                        this.renderTasksTable();
                        return;
                    }

                    // v4.2.3: Унифицированная валидация при изменении любого поля
                    if (field === 'domain' || field === 'oldSub' || field === 'newSub') {
                        this.validateMassInput(taskId, field);

                        // При смене домена перевалидируем oldSub и newSub
                        if (field === 'domain') {
                            this.validateMassInput(taskId, 'oldSub');
                            this.validateMassInput(taskId, 'newSub');
                        }
                    }
                });
            });

            // v4.3.7: Делегирование событий для data-action (надёжнее чем привязка к каждому элементу)
            // v4.5.2 FIX: Используем флаг чтобы не дублировать listener при каждом рендере
            if (!table.dataset.clickAttached) {
                table.dataset.clickAttached = 'true';
                table.addEventListener('click', (e) => {
                    const actionEl = e.target.closest('[data-action]');
                    if (!actionEl) return;

                    e.stopPropagation();
                    const row = actionEl.closest('.task-row');
                    if (!row) return;

                    const taskId = parseInt(row.dataset.taskId);
                    const action = actionEl.dataset.action;
                    this.handleTaskAction(taskId, action, actionEl);
                });
            }
        }

        // v4.3.0: Показать автокомплит в массовом режиме
        showMassAutocomplete(taskId, field) {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task) return;

            const row = this.shadowRoot.querySelector(`.task-row[data-task-id="${taskId}"]`);
            if (!row) return;

            const input = row.querySelector(`input[data-field="${field}"]`);
            const autocompleteDiv = this.shadowRoot.getElementById(`${field}-autocomplete-${taskId}`);
            if (!input || !autocompleteDiv) return;

            const value = input.value.trim();
            autocompleteDiv.innerHTML = '';

            let items = [];

            if (field === 'domain') {
                if (value.length < 1) {
                    this.hideMassAutocomplete(taskId, field);
                    return;
                }
                items = searchDomains(value).map(item => ({
                    value: item.domain,
                    meta: (item.department || 'Без отдела') + ' • ' + (item.cms || 'CMS не указана'),
                    data: item
                }));
            } else if (field === 'oldSub') {
                const db = loadSitesDatabase();
                const normalized = normalizeDomain(task.domain);
                if(DEBUG) {
                    console.log('━━━ MASS oldSub DEBUG ━━━');
                    console.log('task.domain:', task.domain);
                    console.log('normalized:', normalized);
                }
                let site = null;
                for (const d in db) {
                    if (db[d].status === 'active' && normalizeDomain(d) === normalized) {
                        site = db[d];
                        if(DEBUG) console.log('✓ Найден сайт:', d, 'oldSubdomains:', site.oldSubdomains);
                        break;
                    }
                }
                if (!site && DEBUG) console.log('✗ Сайт НЕ найден');
                // v4.3.6: Показываем только при вводе текста
                if (site && site.oldSubdomains && value.length > 0) {
                    items = site.oldSubdomains
                        .filter(s => s.url.toLowerCase().includes(value.toLowerCase()))
                        .map(s => ({
                            value: s.url,
                            meta: '[' + (s.action || '301') + ']' + (s.usedDate ? ' • ' + s.usedDate : ''),
                            data: s
                        }));
                    if(DEBUG) console.log('oldSub mass items:', items.length);
                }
                if(DEBUG) console.log('━━━━━━━━━━━━━━━━━━━━━━━');
            } else if (field === 'newSub') {
                const db = loadSitesDatabase();
                const normalized = normalizeDomain(task.domain);
                if(DEBUG) {
                    console.log('━━━ MASS newSub DEBUG ━━━');
                    console.log('task.domain:', task.domain);
                    console.log('normalized:', normalized);
                }
                let site = null;
                for (const d in db) {
                    if (db[d].status === 'active' && normalizeDomain(d) === normalized) {
                        site = db[d];
                        if(DEBUG) console.log('✓ Найден сайт:', d, 'currentSubdomain:', site.currentSubdomain);
                        break;
                    }
                }
                if (!site && DEBUG) console.log('✗ Сайт НЕ найден');
                // v4.3.6: Показываем только при вводе текста
                if (site && site.currentSubdomain && value.length > 0) {
                    const current = site.currentSubdomain;
                    if (current.toLowerCase().includes(value.toLowerCase())) {
                        items = [{
                            value: current,
                            meta: 'Новый поддомен',
                            data: { url: current }
                        }];
                    }
                    if(DEBUG) console.log('newSub mass items:', items);
                } else {
                    if(DEBUG) console.log('newSub mass: пусто или currentSubdomain не задан');
                }
                if(DEBUG) console.log('━━━━━━━━━━━━━━━━━━━━━━━');
            }

            if (items.length > 0) {
                items.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'autocomplete-item';

                    const valueSpan = document.createElement('div');
                    valueSpan.className = 'autocomplete-domain';
                    valueSpan.textContent = item.value;

                    const metaSpan = document.createElement('div');
                    metaSpan.className = 'autocomplete-meta';
                    metaSpan.textContent = item.meta;

                    itemDiv.appendChild(valueSpan);
                    itemDiv.appendChild(metaSpan);

                    itemDiv.addEventListener('click', () => {
                        input.value = item.value;
                        this.updateTaskField(taskId, field, item.value);
                        this.hideMassAutocomplete(taskId, field);
                        this.validateMassInput(taskId, field);

                        // При выборе домена автозаполняем отдел
                        if (field === 'domain' && item.data && item.data.department) {
                            const deptSelect = row.querySelector('select[data-field="department"]');
                            if (deptSelect) {
                                deptSelect.value = item.data.department;
                                this.updateTaskField(taskId, 'department', item.data.department);
                            }
                        }

                        // v4.3.7: При выборе oldSub устанавливаем флаги редиректа
                        if (field === 'oldSub' && item.data && item.data.action) {
                            const redirectType = item.data.action || '301';
                            const task = this.tasks.find(t => t.id === taskId);
                            if (task) {
                                task.redirect301 = (redirectType === '301');
                                task.redirect404 = (redirectType === '404');
                                // Обновляем чекбоксы в UI
                                const checkbox301 = row.querySelector('input[data-field="redirect301"]');
                                const checkbox404 = row.querySelector('input[data-field="redirect404"]');
                                if (checkbox301) checkbox301.checked = task.redirect301;
                                if (checkbox404) checkbox404.checked = task.redirect404;
                            }
                        }
                    });

                    autocompleteDiv.appendChild(itemDiv);
                });
                autocompleteDiv.classList.add('active');
            } else if (value.length > 0 && field === 'domain') {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'autocomplete-empty';
                emptyDiv.textContent = 'Домен не найден в базе';
                autocompleteDiv.appendChild(emptyDiv);
                autocompleteDiv.classList.add('active');
            } else if (value.length > 0) {
                // v4.3.6: Для oldSub/newSub показываем сообщение при отсутствии результатов
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'autocomplete-empty';
                emptyDiv.textContent = field === 'oldSub' ? 'Нет в истории' : 'Нет данных';
                autocompleteDiv.appendChild(emptyDiv);
                autocompleteDiv.classList.add('active');
            } else {
                this.hideMassAutocomplete(taskId, field);
            }
        }

        hideMassAutocomplete(taskId, field) {
            const autocompleteDiv = this.shadowRoot.getElementById(`${field}-autocomplete-${taskId}`);
            if (autocompleteDiv) {
                autocompleteDiv.classList.remove('active');
            }
        }

        // v4.2.3: Унифицированная валидация для массового режима
        validateMassInput(taskId, field) {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task) return;

            const row = this.shadowRoot.querySelector(`.task-row[data-task-id="${taskId}"]`);
            if (!row) return;

            const input = row.querySelector(`input[data-field="${field}"]`);
            if (!input) return;

            const value = input.value.trim();
            const parent = input.closest('.cell-with-btn') || input.parentElement;

            // Убираем старые классы и tooltip
            input.classList.remove('input-valid', 'input-error');
            const oldTooltip = parent.querySelector('.input-warning-tooltip');
            if (oldTooltip) oldTooltip.remove();

            if (!value) {
                input.title = '';
                return;
            }

            // Определяем тип и домен для валидации
            const type = field; // 'domain', 'oldSub', 'newSub'
            const relatedDomain = (type === 'domain') ? '' : task.domain;

            const validation = validateWithDatabase(type, relatedDomain, value);

            // v4.3.2: Единая логика для всех полей - красная рамка при not-found или www-mismatch
            if (validation.status === 'valid') {
                input.classList.add('input-valid');
                input.title = '';
            } else if (validation.status === 'www-mismatch' || validation.status === 'not-found') {
                input.classList.add('input-error');
                input.title = validation.message || '';
                // Показываем tooltip
                if (validation.message) {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'input-warning-tooltip';
                    tooltip.textContent = validation.message;
                    parent.style.position = 'relative';
                    parent.appendChild(tooltip);
                    setTimeout(() => { if (tooltip.parentElement) tooltip.remove(); }, 5000);
                }
            } else {
                // status: 'new' - обычная рамка
                input.title = '';
            }
        }

        // Deprecated - оставлено для совместимости
        updateWwwWarning(taskId) {
            // Теперь вызываем унифицированную валидацию
            this.validateMassInput(taskId, 'domain');
            this.validateMassInput(taskId, 'oldSub');
            this.validateMassInput(taskId, 'newSub');
        }

        handleTaskAction(taskId, action, el) {
            switch(action) {
                case 'edit-subtasks':
                    this.openTaskSubtasksModal(taskId);
                    break;
                case 'duplicate':
                    this.duplicateTask(taskId);
                    break;
                case 'delete':
                    this.removeTask(taskId);
                    break;
                case 'manage-domains':
                    // v4.5.7: Передаём taskId для выбора домена в массовом режиме
                    this.openUnifiedDomainsModal(taskId);
                    break;
                case 'manage-history':
                    // v4.3.5: Открываем модалку управления поддоменами для конкретной задачи
                    this.openMassSubdomainManagerModal(taskId);
                    break;
                case 'manage-oldurl':
                    // v4.5.9: Открываем модалку управления oldURL
                    this.openOldUrlManagerModal(taskId);
                    break;
                case 'manage-templates':
                    this.openTemplateManager();
                    break;
                case 'view-subtasks':
                    this.showSubtasksPopup(taskId);
                    break;
                case 'clear-task-type':
                    // v4.5.2: Сброс типа задачи
                    this.updateTaskField(taskId, 'taskName', '');
                    this.renderTasksTable();
                    break;
            }
        }

        // v4.3.7: Popup для просмотра подзадач
        showSubtasksPopup(taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task || !task.subtasks || task.subtasks.length === 0) {
                showToast('Нет подзадач');
                return;
            }

            const list = task.subtasks.map((s, i) =>
                `${i + 1}. ${s.name} (${s.priority}, ${s.allocation}%)`
            ).join('\n');

            showToast(`Подзадачи для "${task.taskName}":\n\n${list}`);
        }

        // v4.3.5: Модальное окно управления поддоменами для массового режима
        openMassSubdomainManagerModal(taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task || !task.domain) {
                showToast('Сначала укажите домен для этой задачи');
                return;
            }

            // Временно устанавливаем домен в поле одиночного режима для работы модалки
            const domainInput = this.shadowRoot.getElementById('domain');
            const originalValue = domainInput.value;
            domainInput.value = task.domain;

            // v4.3.7: Передаём taskId для обновления правильного поля
            this.openSubdomainManagerModal('oldSub', taskId);
        }

        // v4.5.9: Модалка для управления oldURL
        openOldUrlManagerModal(taskId) {
            console.log('openOldUrlManagerModal called with taskId:', taskId);
            const task = this.tasks.find(t => t.id === taskId);
            console.log('Found task for oldUrl modal:', task);
            if (!task) {
                showToast('Задача не найдена');
                return;
            }

            // v4.6.9: Домен не обязателен - можно работать без базы
            const db = loadSitesDatabase();
            let siteKey = null;
            let site = null;
            let oldUrls = [];

            if (task.domain) {
                const normalized = normalizeDomain(task.domain);
                for (const d in db) {
                    if (db[d].status === 'active' && normalizeDomain(d) === normalized) {
                        siteKey = d;
                        site = db[d];
                        break;
                    }
                }
                if (site) {
                    oldUrls = site.oldUrls || [];
                }
            }

            // v4.6.13: Также показываем URL из поля задачи (импортированные)
            const taskUrls = parseOldUrls(task.oldUrl);
            const taskUrlsSet = new Set(taskUrls.all);
            const dbUrlsSet = new Set(oldUrls.map(u => u.url));
            
            // URL из задачи, которых нет в базе - добавляем с пометкой
            const importedUrls = [];
            taskUrls.all.forEach((url, i) => {
                if (!dbUrlsSet.has(url)) {
                    // Определяем тип из формата url|type
                    const lines = (task.oldUrl || '').split('\n');
                    let action = '404';
                    for (const line of lines) {
                        const parts = line.split('|');
                        if (parts[0].trim() === url && parts[1]) {
                            action = parts[1].trim();
                            break;
                        }
                    }
                    importedUrls.push({
                        url: url,
                        action: action,
                        usedDate: 'импорт',
                        isImported: true
                    });
                }
            });

            const that = this;

            const modalHtml = `
                <div class="oldurl-manager-modal">
                    <style>
                        .oldurl-manager-modal {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0,0,0,0.5);
                            z-index: 10000002;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .oum-content {
                            background: white;
                            border-radius: 12px;
                            width: 600px;
                            max-height: 95vh;
                            display: flex;
                            flex-direction: column;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            position: relative;
                        }
                        .oum-header {
                            background: linear-gradient(135deg, #4CAF50, #45a049);
                            color: white;
                            padding: 16px 20px;
                            border-radius: 12px 12px 0 0;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                        }
                        .oum-header h3 { margin: 0; font-size: 16px; }
                        .oum-close {
                            background: none;
                            border: none;
                            color: white;
                            font-size: 24px;
                            cursor: pointer;
                            padding: 0;
                            line-height: 1;
                        }
                        .oum-body {
                            padding: 20px;
                            overflow-y: auto;
                            max-height: 60vh;
                        }
                        .oum-section {
                            margin-bottom: 20px;
                        }
                        .oum-section-title {
                            font-weight: 600;
                            margin-bottom: 10px;
                            color: #333;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        }
                        .oum-add-row {
                            display: flex;
                            gap: 8px;
                            margin-bottom: 15px;
                        }
                        .oum-add-row input {
                            flex: 1;
                            padding: 10px 12px;
                            border: 1px solid #ddd;
                            border-radius: 6px;
                            font-size: 14px;
                            color: #333;
                            background: #fff;
                        }
                        .oum-add-row select {
                            padding: 10px;
                            border: 1px solid #ddd;
                            border-radius: 6px;
                            color: #333;
                            background: #fff;
                        }
                        .oum-add-row button {
                            padding: 10px 16px;
                            background: #4CAF50;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 500;
                        }
                        .oum-add-row button:hover { background: #45a049; }
                        .oum-list {
                            border: 1px solid #e0e0e0;
                            border-radius: 8px;
                            overflow: hidden;
                        }
                        .oum-list-item {
                            display: flex;
                            align-items: center;
                            padding: 12px;
                            border-bottom: 1px solid #e0e0e0;
                            gap: 10px;
                            background: #fff;
                        }
                        .oum-list-item:last-child { border-bottom: none; }
                        .oum-list-item:hover { background: #f5f5f5; }
                        .oum-list-checkbox {
                            width: 18px;
                            height: 18px;
                            cursor: pointer;
                        }
                        .oum-list-url {
                            flex: 1;
                            font-family: monospace;
                            font-size: 13px;
                            word-break: break-all;
                            color: #333;
                        }
                        .oum-list-meta {
                            display: flex;
                            gap: 8px;
                            align-items: center;
                            color: #666;
                        }
                        .oum-badge {
                            padding: 3px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                        }
                        .oum-badge-301 { background: #e3f2fd; color: #1565c0; }
                        .oum-badge-404 { background: #ffebee; color: #c62828; }
                        .oum-list-use {
                            padding: 6px 12px;
                            background: #e3f2fd;
                            color: #1976d2;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        }
                        .oum-list-use:hover { background: #bbdefb; }
                        .oum-list-delete {
                            padding: 6px 10px;
                            background: none;
                            border: none;
                            cursor: pointer;
                            opacity: 0.5;
                        }
                        .oum-list-delete:hover { opacity: 1; }
                        .oum-list-remove-from-task, .oum-list-save-to-db {
                            padding: 4px 8px;
                            background: none;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s;
                        }
                        .oum-list-remove-from-task:hover {
                            background: #ffebee;
                            border-color: #ef5350;
                        }
                        .oum-list-save-to-db:hover {
                            background: #e3f2fd;
                            border-color: #2196f3;
                        }
                        .oum-list-empty {
                            padding: 20px;
                            text-align: center;
                            color: #999;
                        }
                        .oum-footer {
                            padding: 15px 20px;
                            border-top: 1px solid #e0e0e0;
                            display: flex;
                            justify-content: space-between;
                            gap: 10px;
                        }
                        .oum-footer-left {
                            display: flex;
                            gap: 10px;
                            align-items: center;
                        }
                        .oum-footer-right {
                            display: flex;
                            gap: 10px;
                        }
                        .oum-btn {
                            padding: 10px 20px;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 500;
                        }
                        .oum-btn-primary {
                            background: #4CAF50;
                            color: white;
                        }
                        .oum-btn-primary:hover { background: #45a049; }
                        .oum-btn-primary:disabled { background: #ccc; cursor: not-allowed; }
                        .oum-btn-close {
                            background: #e0e0e0;
                            color: #333;
                        }
                        .oum-btn-close:hover { background: #d0d0d0; }
                        .oum-select-all-label {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            color: #333;
                            font-size: 13px;
                            cursor: pointer;
                        }
                    </style>
                    <div class="oum-content">
                        <div class="oum-header">
                            <h3>📋 oldURL${task.domain ? ': ' + task.domain : ' (без привязки к домену)'}</h3>
                            <button class="oum-close" id="oum-close-x">×</button>
                        </div>
                        <div class="oum-body">
                            <div class="oum-section">
                                <div class="oum-section-title">📦 История oldURL${!siteKey ? ' <span style="color: #999; font-size: 11px;">(укажите домен для синхронизации с базой)</span>' : ''}</div>
                                <div class="oum-add-row">
                                    <input type="text" id="oum-new-url" placeholder="https://site.com/page/" />
                                    <select id="oum-new-action">
                                        <option value="404">404</option>
                                        <option value="301">301</option>
                                    </select>
                                    <button id="oum-add-btn">+ Добавить</button>
                                </div>
                                ${importedUrls.length > 0 ? `
                                <div class="oum-section-subtitle" style="font-size: 12px; color: #FF9800; margin: 10px 0 5px; font-weight: 600;">📋 Выбрано для задачи (${importedUrls.length}):</div>
                                <div class="oum-list" id="oum-imported-list">
                                    ${importedUrls.map((u, i) => `
                                        <div class="oum-list-item oum-imported" data-index="imported-${i}" style="background: #fff8e1;">
                                            <input type="checkbox" class="oum-list-checkbox" data-url="${u.url}" data-action="${u.action || '404'}" checked disabled />
                                            <div class="oum-list-url">${u.url}</div>
                                            <div class="oum-list-meta">
                                                <span class="oum-badge oum-badge-${u.action || '404'}">${u.action || '404'}</span>
                                                <span style="color: #FF9800;">✓ выбран</span>
                                            </div>
                                            <button class="oum-list-remove-from-task" data-url="${u.url}" title="Убрать из задачи">❌</button>
                                            ${siteKey ? `<button class="oum-list-save-to-db" data-url="${u.url}" data-action="${u.action || '404'}" title="Сохранить в базу">💾</button>` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                ` : ''}
                                ${oldUrls.length > 0 ? `<div class="oum-section-subtitle" style="font-size: 12px; color: #666; margin: 10px 0 5px; font-weight: 600;">📚 История из базы (${oldUrls.length}):</div>` : ''}
                                <div class="oum-list" id="oum-list">
                                    ${oldUrls.length === 0 && importedUrls.length === 0 ?
                                        `<div class="oum-list-empty">${siteKey ? 'История пуста' : 'Укажите домен чтобы увидеть историю из базы'}</div>` :
                                        oldUrls.map((u, i) => `
                                            <div class="oum-list-item ${taskUrlsSet.has(u.url) ? 'oum-selected' : ''}" data-index="${i}" ${taskUrlsSet.has(u.url) ? 'style="background: #e8f5e9;"' : ''}>
                                                <input type="checkbox" class="oum-list-checkbox" data-url="${u.url}" data-action="${u.action || '404'}" ${taskUrlsSet.has(u.url) ? 'checked disabled' : ''} />
                                                <div class="oum-list-url">${u.url}</div>
                                                <div class="oum-list-meta">
                                                    <span class="oum-badge oum-badge-${u.action || '404'}">${u.action || '404'}</span>
                                                    ${u.usedDate ? `<span>${u.usedDate}</span>` : ''}
                                                    ${taskUrlsSet.has(u.url) ? '<span style="color: #4CAF50;">✓</span>' : ''}
                                                </div>
                                                ${!taskUrlsSet.has(u.url) ? `<button class="oum-list-use" data-url="${u.url}" data-action="${u.action || '404'}">Выбрать</button>` : ''}
                                                <button class="oum-list-delete" data-index="${i}">🗑️</button>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>
                        </div>
                        <div class="oum-footer">
                            <div class="oum-footer-left">
                                ${oldUrls.length > 0 ? `
                                    <label class="oum-select-all-label">
                                        <input type="checkbox" id="oum-select-all" />
                                        Выбрать все
                                    </label>
                                ` : ''}
                            </div>
                            <div class="oum-footer-right">
                                <button class="oum-btn oum-btn-primary" id="oum-use-selected-btn" disabled>Добавить отмеченные (0)</button>
                                <button class="oum-btn oum-btn-close" id="oum-close-btn">Закрыть</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const container = document.createElement('div');
            container.innerHTML = modalHtml;
            this.shadowRoot.appendChild(container.firstElementChild);

            const modal = this.shadowRoot.querySelector('.oldurl-manager-modal');

            // Закрытие
            const closeModal = () => modal.remove();
            modal.querySelector('#oum-close-x').addEventListener('click', closeModal);
            modal.querySelector('#oum-close-btn').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

            // Предотвращаем всплытие событий
            modal.querySelectorAll('input, select, button').forEach(el => {
                el.addEventListener('keydown', e => e.stopPropagation());
                el.addEventListener('keyup', e => e.stopPropagation());
                el.addEventListener('keypress', e => e.stopPropagation());
            });

            // Добавить новый URL
            modal.querySelector('#oum-add-btn').addEventListener('click', () => {
                const urlInput = modal.querySelector('#oum-new-url');
                const actionSelect = modal.querySelector('#oum-new-action');
                const url = urlInput.value.trim();
                const action = actionSelect.value;

                if (!url) {
                    showToast('Введите URL');
                    return;
                }

                // v4.6.11: Если домен указан, но не в базе - создаём его
                const db = loadSitesDatabase();
                let actualSiteKey = siteKey;
                
                if (!actualSiteKey && task.domain) {
                    // Создаём сайт в базе
                    const newDomain = task.domain;
                    db[newDomain] = {
                        department: task.department || '',
                        cms: '',
                        hreflangTemplate: '',
                        hasAMP: false,
                        dmcaDefault: false,
                        status: 'active',
                        oldSubdomains: [],
                        currentSubdomain: '',
                        oldUrls: [],
                        notes: ''
                    };
                    actualSiteKey = newDomain;
                    showToast(`Домен ${newDomain} добавлен в базу`);
                }

                if (actualSiteKey) {
                    if (!db[actualSiteKey].oldUrls) db[actualSiteKey].oldUrls = [];
                    
                    // Проверяем дубликат
                    const exists = db[actualSiteKey].oldUrls.find(u => u.url === url);
                    if (exists) {
                        showToast('Такой URL уже есть в истории');
                        return;
                    }

                    db[actualSiteKey].oldUrls.unshift({
                        url: url,
                        action: action,
                        usedDate: new Date().toLocaleDateString('ru-RU')
                    });
                    saveSitesDatabase(db);
                    showToast(`URL добавлен (${action})`);
                    closeModal();
                    this.openOldUrlManagerModal(taskId); // Перезагружаем модалку
                } else {
                    // Без домена - добавляем напрямую в поле задачи с типом
                    const task = that.tasks.find(t => t.id === taskId);
                    if (task) {
                        const urlWithType = `${url}|${action}`;
                        const current = task.oldUrl || '';
                        task.oldUrl = current ? current + '\n' + urlWithType : urlWithType;
                        that.renderTasksTable();
                        showToast(`URL добавлен в задачу (${action})`);
                    }
                    closeModal();
                }
            });

            // Удалить URL
            modal.querySelectorAll('.oum-list-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!siteKey) {
                        showToast('Нельзя удалить - домен не указан');
                        return;
                    }
                    const index = parseInt(btn.dataset.index);
                    const db = loadSitesDatabase();
                    if (db[siteKey] && db[siteKey].oldUrls) {
                        db[siteKey].oldUrls.splice(index, 1);
                        saveSitesDatabase(db);
                        showToast('URL удалён');
                        closeModal();
                        this.openOldUrlManagerModal(taskId);
                    }
                });
            });

            // v4.6.13: Убрать URL из задачи (импортированные)
            modal.querySelectorAll('.oum-list-remove-from-task').forEach(btn => {
                btn.addEventListener('click', () => {
                    const urlToRemove = btn.dataset.url;
                    const task = that.tasks.find(t => t.id === taskId);
                    if (task && task.oldUrl) {
                        // Удаляем строку с этим URL
                        const lines = task.oldUrl.split('\n').filter(line => {
                            const parts = line.split('|');
                            return parts[0].trim() !== urlToRemove;
                        });
                        task.oldUrl = lines.join('\n');
                        that.renderTasksTable();
                        showToast('URL убран из задачи');
                        closeModal();
                        this.openOldUrlManagerModal(taskId);
                    }
                });
            });

            // v4.6.13: Сохранить импортированный URL в базу
            modal.querySelectorAll('.oum-list-save-to-db').forEach(btn => {
                btn.addEventListener('click', () => {
                    const url = btn.dataset.url;
                    const action = btn.dataset.action || '404';
                    const db = loadSitesDatabase();
                    
                    if (siteKey && db[siteKey]) {
                        if (!db[siteKey].oldUrls) db[siteKey].oldUrls = [];
                        
                        // Проверяем дубликат
                        const exists = db[siteKey].oldUrls.find(u => u.url === url);
                        if (exists) {
                            showToast('URL уже есть в базе');
                            return;
                        }
                        
                        db[siteKey].oldUrls.unshift({
                            url: url,
                            action: action,
                            usedDate: new Date().toLocaleDateString('ru-RU')
                        });
                        saveSitesDatabase(db);
                        showToast('URL сохранён в базу');
                        closeModal();
                        this.openOldUrlManagerModal(taskId);
                    }
                });
            });

            // Выбрать URL - добавить в поле oldUrl задачи с типом
            modal.querySelectorAll('.oum-list-use').forEach(btn => {
                btn.addEventListener('click', () => {
                    const url = btn.dataset.url;
                    const action = btn.dataset.action || '404';
                    const task = that.tasks.find(t => t.id === taskId);
                    if (task) {
                        // v4.6.15: Проверяем дубликаты
                        const existingUrls = parseOldUrls(task.oldUrl).all;
                        if (existingUrls.includes(url)) {
                            showToast('Этот URL уже добавлен');
                            closeModal();
                            return;
                        }
                        
                        const urlWithType = `${url}|${action}`;
                        if (task.oldUrl) {
                            task.oldUrl = task.oldUrl + '\n' + urlWithType;
                        } else {
                            task.oldUrl = urlWithType;
                        }
                        that.renderTasksTable();
                        showToast(`Добавлен (${action}): ${url}`);
                    }
                    closeModal();
                });
            });

            // v4.6.1: Обработчики для множественного выбора
            const checkboxes = modal.querySelectorAll('.oum-list-checkbox');
            const useSelectedBtn = modal.querySelector('#oum-use-selected-btn');
            const selectAllCheckbox = modal.querySelector('#oum-select-all');
            console.log('Checkboxes found:', checkboxes.length, 'useSelectedBtn:', useSelectedBtn, 'selectAllCheckbox:', selectAllCheckbox);

            // Функция обновления состояния кнопки
            const updateSelectedCount = () => {
                // v4.6.15: Считаем только активные (не disabled) чекбоксы
                const checked = modal.querySelectorAll('.oum-list-checkbox:checked:not(:disabled)');
                const enabledCheckboxes = modal.querySelectorAll('.oum-list-checkbox:not(:disabled)');
                const count = checked.length;
                console.log('updateSelectedCount: count =', count, 'useSelectedBtn =', useSelectedBtn);
                if (useSelectedBtn) {
                    useSelectedBtn.textContent = `Добавить отмеченные (${count})`;
                    useSelectedBtn.disabled = count === 0;
                    console.log('Button disabled:', useSelectedBtn.disabled);
                }
                // Обновляем состояние "Выбрать все"
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = count === enabledCheckboxes.length && count > 0;
                    selectAllCheckbox.indeterminate = count > 0 && count < enabledCheckboxes.length;
                }
            };

            // Обработчик для каждого чекбокса
            checkboxes.forEach(cb => {
                cb.addEventListener('change', () => {
                    console.log('Checkbox changed:', cb.dataset.url, 'checked:', cb.checked);
                    updateSelectedCount();
                });
            });

            // Обработчик "Выбрать все"
            if (selectAllCheckbox) {
                selectAllCheckbox.addEventListener('change', () => {
                    const isChecked = selectAllCheckbox.checked;
                    // v4.6.15: Только активные (не disabled) чекбоксы
                    const enabledCheckboxes = modal.querySelectorAll('.oum-list-checkbox:not(:disabled)');
                    enabledCheckboxes.forEach(cb => cb.checked = isChecked);
                    updateSelectedCount();
                });
            }

            // Обработчик кнопки "Добавить отмеченные"
            console.log('useSelectedBtn element:', useSelectedBtn);
            if (useSelectedBtn) {
                console.log('Registering click handler for useSelectedBtn');
                useSelectedBtn.addEventListener('click', () => {
                    // v4.6.15: Пропускаем disabled чекбоксы (уже выбранные)
                    const checked = modal.querySelectorAll('.oum-list-checkbox:checked:not(:disabled)');
                    console.log('Добавить отмеченные clicked, checked:', checked.length, 'taskId:', taskId);
                    if (checked.length === 0) {
                        showToast('Все выбранные URL уже добавлены');
                        return;
                    }

                    const task = that.tasks.find(t => t.id === taskId);
                    console.log('Found task:', task);
                    if (task) {
                        // v4.6.15: Проверяем дубликаты
                        const existingUrls = parseOldUrls(task.oldUrl).all;
                        const existingSet = new Set(existingUrls);
                        
                        const newUrlsToAdd = [];
                        Array.from(checked).forEach(cb => {
                            const url = cb.dataset.url;
                            const action = cb.dataset.action || '404';
                            if (!existingSet.has(url)) {
                                newUrlsToAdd.push(`${url}|${action}`);
                                existingSet.add(url); // Предотвращаем дубли в текущем batch
                            }
                        });
                        
                        if (newUrlsToAdd.length === 0) {
                            showToast('Все выбранные URL уже добавлены');
                            closeModal();
                            return;
                        }
                        
                        const newUrls = newUrlsToAdd.join('\n');
                        if (task.oldUrl) {
                            task.oldUrl = task.oldUrl + '\n' + newUrls;
                        } else {
                            task.oldUrl = newUrls;
                        }
                        console.log('Updated task.oldUrl:', task.oldUrl);
                        that.renderTasksTable();
                        showToast(`Добавлено ${newUrlsToAdd.length} URL`);
                    } else {
                        console.error('Task not found! taskId:', taskId, 'tasks:', that.tasks);
                    }
                    closeModal();
                });
            } else {
                console.error('useSelectedBtn NOT FOUND!');
            }

            // v4.6.4: Инициализируем состояние кнопки
            updateSelectedCount();
        }

        openTaskSubtasksModal(taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (!task) return;

            // Создаём модальное окно для редактирования подзадач
            const modal = new TaskSubtasksEditorModal(this.shadowRoot, task, (updatedSubtasks) => {
                task.subtasks = updatedSubtasks;
                this.renderTasksTable();
            });
            modal.show();
        }

        validateAllTasks() {
            const errors = [];
            this.tasks.forEach((t, i) => {
                const e = [];
                if (!t.taskName) e.push('Название');
                if (!t.department) e.push('Отдел');
                if (!t.domain) e.push('Домен');
                if (!t.oldSub) e.push('Старый поддомен');
                if (!t.newSub) e.push('Новый поддомен');
                if (t.templateIndex === undefined || t.templateIndex === '') e.push('hreflang');
                if (!t.priority) e.push('Приоритет');
                if (e.length) errors.push(`Задача #${i + 1}: ${e.join(', ')}`);
            });
            return errors;
        }

        async processAllTasks() {
            if (!this.tasks.length) {
                showToast('Нет задач для выполнения!');
                return;
            }

            const errors = this.validateAllTasks();
            if (errors.length) {
                showToast('Ошибки валидации:\n\n' + errors.join('\n'));
                return;
            }

            // Сортируем задачи по приоритету: high → medium → low
            const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2, '': 3 };
            const sortedTasks = [...this.tasks].sort((a, b) => {
                return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
            });

            this.showStatusLog();
            this.logMessage(`🚀 Массовая автоматизация: ${sortedTasks.length} задач`);
            this.logMessage(`📊 Порядок: High → Medium → Low`);

            const results = { success: [], failed: [] };

            for (let i = 0; i < sortedTasks.length; i++) {
                const task = sortedTasks[i];
                try {
                    this.logMessage(`\n📋 [${i+1}/${sortedTasks.length}] ${task.taskName} [${task.priority || 'no priority'}]`);
                    this.logMessage(`   ${task.oldSub} → ${task.newSub}`);

                    // Добавляем в историю
                    addToHistory(task.domain, task.oldSub);

                    // FIX v4.1.8: Автообновление базы сайтов
                    updateSiteAfterTask(task.domain, {
                        department: task.department,
                        cms: task.cms,
                        hasAMP: task.amp,
                        dmcaDefault: task.dmca,
                        currentSubdomain: task.newSub,
                        lastTaskDate: new Date().toISOString().split('T')[0],
                        oldSubdomain: task.oldSub,
                        redirect301: task.redirect301,
                        redirect404: task.redirect404,
                        // v4.6.17: Новые поля
                        alternateDomain: task.alternateDomain,
                        toUrl: task.toUrl,
                        oldUrl: task.oldUrl
                    });

                    // Генерируем ТЗ
                    const tz = this.generateTZ(task);

                    // Создаём задачу в Asana
                    const taskData = await this.createAsanaTask(task, tz);
                    const url = `https://app.asana.com/0/${CONFIG.asana.projects[task.department]}/${taskData.gid}`;
                    this.logMessage(`✓ Создана: ${url}`, 'success');
                    results.success.push(task.taskName);

                    // v4.3.3: Запись в историю автоматизаций
                    addToAutomationHistory({
                        taskName: task.taskName,
                        domain: task.domain,
                        oldSub: task.oldSub,
                        newSub: task.newSub,
                        alternateDomain: task.alternateDomain,
                        department: task.department,
                        cms: task.cms,
                        template: task.templateName || '',
                        priority: task.priority,
                        redirect301: task.redirect301,
                        redirect404: task.redirect404,
                        hasAMP: task.amp,
                        dmca: task.dmca,
                        assignee: task.assignee,
                        asanaTaskId: taskData.gid,
                        asanaTaskUrl: url,
                        status: 'success',
                        mode: 'mass',
                        subtasksCount: task.subtasks?.length || 0,
                        subtasks: (task.subtasks || []).map(s => ({ name: s.name, priority: s.priority }))
                    });

                    // Создаём подзадачи
                    if (task.subtasks.length) {
                        const projectGid = CONFIG.asana.projects[task.department];
                        for (const sub of task.subtasks) {
                            if (sub.name && sub.name.trim()) {
                                try {
                                    await this.createAsanaSubtask(
                                        taskData.gid,
                                        sub,
                                        projectGid,
                                        CONFIG.asana.workspaceGid
                                    );
                                    this.logMessage(`   ✓ ${sub.name}`, 'success');
                                } catch (e) {
                                    this.logMessage(`   ⚠️ Подзадача: ${e.message}`, 'error');
                                }
                            }
                        }
                    }

                    // Rocket.Chat для High priority
                    if (task.priority === 'high') {
                        try {
                            await this.sendRocketChatNotification(task, taskData);
                            this.logMessage('✓ Rocket.Chat', 'success');
                        } catch (e) {
                            this.logMessage(`⚠ Rocket.Chat: ${e.message}`, 'error');
                        }
                    }
                } catch (e) {
                    console.error(`Ошибка задачи ${task.taskName}:`, e);
                    this.logMessage(`❌ Ошибка: ${e.message}`, 'error');
                    results.failed.push(task.taskName);
                }

                // Пауза между задачами
                await new Promise(r => setTimeout(r, 1000));
            }

            this.logMessage(`\n========== ИТОГИ ==========`, 'success');
            this.logMessage(`✅ Успешно: ${results.success.length}`, 'success');
            if (results.failed.length) {
                this.logMessage(`❌ Ошибки: ${results.failed.length}`, 'error');
            }
            this.logMessage(`🎉 Автоматизация завершена!`, 'success');

            if (results.success.length && confirm('Очистить список задач?')) {
                this.tasks = [];
                this.renderTasksTable();
                this.updateTasksCount();
            }
        }

        generateTZ(task) {
            const templates = loadTemplates();

            // Функция очистки URL
            const cleanUrl = (url) => {
                if (!url) return '';
                return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
            };

            // Очищаем данные
            const domain = cleanUrl(task.domain);
            const oldSub = cleanUrl(task.oldSub);
            const newSub = cleanUrl(task.newSub);

            const hreflangTemplate = task.templateIndex !== '' ? templates[task.templateIndex] : null;

            // Генерируем hreflang код
            let hreflangCode = '';
            if (hreflangTemplate) {
                hreflangCode = hreflangTemplate.code
                    .replace(/\{\{newSub\}\}/g, newSub)
                    .replace(/\{\{domain\}\}/g, domain);
            } else if (newSub && domain) {
                hreflangCode = `<link rel="canonical" href="https://${newSub}/"/>
<link rel="alternate" hreflang="x-default" href="https://${domain}/"/>
<link rel="alternate" hreflang="ru" href="https://${newSub}/"/>`;
            }

            let taskName = task.taskName || 'Смена поддомена';
            let percentAlloc = 0.03;
            if (task.amp) {
                taskName += ' + AMP';
                percentAlloc = 0.04;
            }

            // Формируем ТЗ согласно шаблону
            let desc = '';

            // Блок 1: 301 редирект (если выбран)
            if (task.redirect301) {
                desc += `Если есть 301 редирект:

1) Снести 301 редирект с https://${domain}/ на https://${domain}/page/

`;
            }

            // Блок 2: 404 для страниц
            desc += `2) Отдать 404 для страниц:
https://${domain}/page/
https://${oldSub}/
https://${domain}/hreflang/ (может быть несколько) и

`;

            // Блок 3: Домен подмены
            desc += `Если есть домен-подмена:

3) Домен подмены отключить и не продлять:
https://${oldSub}/

`;

            // Блок 4: Создать страницу на дропе
            desc += `4) Создать страницу на дропе (дубль главной):
https://${newSub}/

`;

            // Блок 5: Канониклы и хрефланги
            desc += `5) На главной странице и внутряке (https://${domain}/ и https://${newSub}/) прописать канониклы и хрефланги:
${hreflangCode}
Меняем старые канониклы и хрефланги на новые

`;

            // Блок 6: Актуализировать ссылки
            desc += `Если надо:

6) Актуализировать ссылки в (выбрать одно или несколько: футере, хедере, боковом меню, sitemap)

`;

            // Блок 7: Важная плашка
            desc += `Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`;

            return { name: taskName, description: desc, percentAllocation: percentAlloc };
        }

        importTasks() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.xls';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                // v4.5.5: Показываем какой файл импортируем
                showToast(`📂 Загрузка: ${file.name}`, 'info', 2000);
                
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const workbook = XLSX.read(ev.target.result, { type: 'array' });

                        // v4.5.2: Поиск листа по имени (приоритет) или по индексу (fallback)
                        const findSheet = (names) => {
                            for (const name of names) {
                                if (workbook.SheetNames.includes(name)) return workbook.Sheets[name];
                            }
                            return null;
                        };

                        // Лист Задачи - ищем по имени или берём первый
                        const tasksSheet = findSheet(['Задачи', 'Tasks', 'задачи']) || workbook.Sheets[workbook.SheetNames[0]];
                        const tasksData = XLSX.utils.sheet_to_json(tasksSheet, { header: 1 });

                        if (tasksData.length < 2) {
                            showToast('Файл пуст или неверный формат');
                            return;
                        }

                        // v4.5.0: Умное сопоставление колонок через FIELD_REGISTRY
                        const headers = tasksData[0];
                        const columnMapping = {}; // { fieldId: columnIndex }
                        const unmappedColumns = [];

                        headers.forEach((header, index) => {
                            const fieldId = matchColumnToField(header);
                            if (fieldId) {
                                columnMapping[fieldId] = index;
                            } else if (header && String(header).trim()) {
                                unmappedColumns.push(String(header).trim());
                            }
                        });

                        if (DEBUG) {
                            console.log('Column mapping:', columnMapping);
                            if (unmappedColumns.length) console.log('Unmapped columns:', unmappedColumns);
                        }

                        const importedTasks = [];

                        // v4.5.2: Пропускаем строку подсказок (содержит "example.com", "1,2,3", "Тип задачи" и т.д.)
                        const isHintRow = (row) => {
                            if (!row) return false;
                            const firstCell = String(row[0] || '').toLowerCase();
                            const hasExampleDomain = row.some(cell => String(cell || '').toLowerCase().includes('example.com'));
                            const hasHintMarkers = firstCell.includes('1,2,3') || firstCell.includes('...') || firstCell.includes('№');
                            const hasTypeHint = row.some(cell => String(cell || '').toLowerCase() === 'тип задачи');
                            return hasExampleDomain || hasHintMarkers || hasTypeHint;
                        };

                        const startRow = isHintRow(tasksData[1]) ? 2 : 1;

                        for (let i = startRow; i < tasksData.length; i++) {
                            const row = tasksData[i];
                            if (!row || row.every(cell => !cell)) continue; // пропускаем пустые строки
                            if (isHintRow(row)) continue; // пропускаем строки-подсказки

                            // Функция получения значения по fieldId
                            const getVal = (fieldId) => {
                                const idx = columnMapping[fieldId];
                                return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : '';
                            };

                            // Парсим redirect
                            let redirect301 = false, redirect404 = false;
                            const redirectVal = getVal('redirect');
                            if (redirectVal === '301' || redirectVal.toLowerCase() === 'да' || redirectVal === '1') {
                                redirect301 = true;
                            } else if (redirectVal === '404') {
                                redirect404 = true;
                            }

                            // v4.5.0: Парсим hreflang через parseHreflangGeo
                            const hreflangVal = getVal('hreflang');
                            const templateIndex = parseHreflangGeo(hreflangVal);

                            const task = {
                                id: this.taskIdCounter++,
                                taskName: getVal('taskName') || 'Смена поддомена',
                                department: getVal('department') || '',
                                domain: getVal('domain') || '',
                                oldSub: getVal('oldSub') || '',
                                redirect301: redirect301,
                                redirect404: redirect404,
                                newSub: getVal('newSub') || '',
                                toUrl: getVal('toUrl') || '',
                                oldUrl: getVal('oldUrl') || '',
                                alternateDomain: getVal('alternateDomain') || '',
                                templateIndex: templateIndex,
                                priority: getVal('priority') || '',
                                cms: getVal('cms') || '',
                                dmca: ['true', '1', 'да'].includes(getVal('dmca').toLowerCase()),
                                amp: (() => {
                                    const val = getVal('amp').toLowerCase();
                                    if (['domain', 'домен', 'на домене'].includes(val)) return 'domain';
                                    if (['subdomain', 'поддомен', 'на поддомене'].includes(val)) return 'subdomain';
                                    if (['both', 'оба', 'на обоих'].includes(val)) return 'both';
                                    if (['true', '1', 'да'].includes(val)) return 'both'; // обратная совместимость
                                    return '';
                                })(),
                                assignee: this.resolveAssignee(getVal('assignee') || ''),
                                pingRocket: ['true', '1', 'да'].includes(getVal('pingRocket').toLowerCase()),
                                notes: getVal('notes') || '',
                                subtasks: []
                            };

                            // Пропускаем если нет основных данных
                            if (!task.domain && !task.oldSub && !task.newSub) continue;

                            importedTasks.push(task);
                        }

                        // v4.5.2: Добавляем закреплённые подзадачи ко всем импортированным задачам
                        const subtaskTemplates = loadSubtaskTemplates();
                        const pinnedSubtasks = [];
                        Object.values(subtaskTemplates).forEach(deptTemplates => {
                            if (Array.isArray(deptTemplates)) {
                                deptTemplates.forEach(t => {
                                    if (t.pinned) {
                                        pinnedSubtasks.push({
                                            name: t.name,
                                            priority: t.priority || 'medium',
                                            allocation: t.allocation || 1,
                                            assignee: t.assignee || ''
                                        });
                                    }
                                });
                            }
                        });

                        if (pinnedSubtasks.length > 0) {
                            importedTasks.forEach(task => {
                                // Добавляем только те pinned, которых ещё нет
                                pinnedSubtasks.forEach(pinned => {
                                    const exists = task.subtasks.some(s => s.name === pinned.name);
                                    if (!exists) {
                                        task.subtasks.push({ ...pinned });
                                    }
                                });
                            });
                        }

                        // Лист Подзадачи - ищем по имени или берём второй
                        const subtasksSheet = findSheet(['Подзадачи', 'Subtasks', 'подзадачи']) || (workbook.SheetNames.length > 1 ? workbook.Sheets[workbook.SheetNames[1]] : null);
                        if (subtasksSheet) {
                            const subtasksData = XLSX.utils.sheet_to_json(subtasksSheet, { header: 1 });

                            if (subtasksData.length > 1) {
                                const subHeaders = subtasksData[0].map(h => String(h || '').trim().toLowerCase());

                                // v4.5.2: Пропуск строки подсказок в подзадачах
                                const isSubHintRow = (row) => {
                                    if (!row) return false;
                                    const firstCell = String(row[0] || '').toLowerCase();
                                    const secondCell = String(row[1] || '').toLowerCase();
                                    return firstCell.includes('№') || firstCell.includes('задачи') ||
                                           secondCell.includes('название') || secondCell.includes('high/medium');
                                };

                                const startSubRow = isSubHintRow(subtasksData[1]) ? 2 : 1;

                                for (let i = startSubRow; i < subtasksData.length; i++) {
                                    const row = subtasksData[i];
                                    if (!row || isSubHintRow(row)) continue;

                                    const getVal = (field) => {
                                        const idx = subHeaders.indexOf(field.toLowerCase());
                                        return idx !== -1 && row[idx] !== undefined ? String(row[idx]).trim() : '';
                                    };

                                    const taskIndex = parseInt(getVal('taskindex') || getVal('задача')) - 1;
                                    if (isNaN(taskIndex) || taskIndex < 0 || taskIndex >= importedTasks.length) continue;

                                    const subtask = {
                                        name: getVal('name') || getVal('название') || '',
                                        priority: getVal('priority') || getVal('приоритет') || 'medium',
                                        allocation: parseInt(getVal('percent') || getVal('hours') || getVal('allocation') || getVal('часы')) || 100,
                                        assignee: this.resolveAssignee(getVal('assignee') || getVal('исполнитель') || '')
                                    };

                                    if (subtask.name) {
                                        importedTasks[taskIndex].subtasks.push(subtask);
                                    }
                                }
                            }
                        }

                        // v4.5.5: Импорт ВСЕГДА заменяет таблицу
                        this.tasks = [];
                        this.taskIdCounter = 1;
                        importedTasks.forEach((t, i) => { t.id = i + 1; });
                        this.taskIdCounter = importedTasks.length + 1;

                        importedTasks.forEach(t => this.tasks.push(t));
                        this.renderTasksTable();
                        this.updateTasksCount();

                        // v4.5.5: Информативное сообщение об импорте с именем файла
                        let msg = `✅ ${file.name}\n\nИмпортировано ${importedTasks.length} задач`;
                        if (unmappedColumns.length) {
                            msg += `\n\n⚠️ Нераспознанные колонки: ${unmappedColumns.join(', ')}`;
                        }
                        showToast(msg, 'success', 5000);

                    } catch (err) {
                        console.error('Import error:', err);
                        showToast('Ошибка чтения файла: ' + err.message);
                    }
                };
                reader.readAsArrayBuffer(file);
            };
            input.click();
        }

        async exportTasks() {
            // === ДИНАМИЧЕСКИЕ ДАННЫЕ ИЗ СКРИПТА ===
            const taskTypes = loadTaskTypes();
            const taskTypeNames = Object.values(taskTypes).map(t => t.name);
            const departments = getDepartmentsList();
            const cmsList = getCmsList().map(c => c.name);
            const hreflangTemplates = loadTemplates().map(t => t.name);
            const priorities = ['High', 'Medium', 'Low'];
            const redirects = ['301', '404', '-'];
            const boolValues = ['true', 'false'];
            const ampValues = ['domain', 'subdomain', 'both'];  // v4.6.17: отдельный список для AMP
            const subtaskTemplates = loadSubtaskTemplates();

            // Маппинг для конвертации
            const hreflangNames = {};
            hreflangTemplates.forEach((name, i) => { hreflangNames[String(i)] = name; });

            const rocketMapping = loadRocketChatMapping();
            const assigneeIdToName = (id) => {
                if (!id) return '';
                const data = rocketMapping[id];
                if (!data) return id;
                return typeof data === 'object' ? (data.asanaName || data.name || id) : data;
            };

            const teamCache = loadTeamMembersFromCache();
            const gidToName = (gid) => {
                if (!gid) return '';
                const member = teamCache.data?.find(m => m.gid === gid);
                return member ? member.name : gid;
            };

            // === СОЗДАНИЕ WORKBOOK С EXCELJS ===
            const wb = new ExcelJS.Workbook();
            wb.creator = 'SEO Subdomain Automation Suite';
            wb.created = new Date();

            // Стили
            const headerStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } },
                alignment: { horizontal: 'center', vertical: 'middle' },
                border: {
                    top: { style: 'thin' }, bottom: { style: 'thin' },
                    left: { style: 'thin' }, right: { style: 'thin' }
                }
            };

            const hintStyle = {
                font: { italic: true, color: { argb: 'FF999999' }, size: 10 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } },
                alignment: { horizontal: 'center' }
            };

            const categoryStyle = {
                font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF607D8B' } }
            };

            // === ЛИСТ 1: Справочники ===
            const refSheet = wb.addWorksheet('Справочники');

            // Собираем названия подзадач из всех шаблонов (по всем ключам)
            const subtaskNames = [];
            const allTemplateKeys = Object.keys(subtaskTemplates);
            for (const key of allTemplateKeys) {
                const templates = subtaskTemplates[key] || [];
                templates.forEach(t => {
                    if (t.name && !subtaskNames.includes(t.name)) {
                        subtaskNames.push(t.name);
                    }
                });
            }
            // Добавляем стандартные если пусто
            if (subtaskNames.length === 0) {
                subtaskNames.push('SEO проверка', 'DEV реализация', 'Актуализация ссылок', 'Проверка редиректов', 'Обновление sitemap');
            }

            // Генерируем номера задач 1-50
            const taskIndexes = Array.from({length: 50}, (_, i) => i + 1);

            const refHeaders = ['Типы задач', 'Отделы', 'Редирект', 'hreflang', 'Приоритет', 'CMS', 'Да/Нет', '№ задачи', 'Подзадачи', 'AMP'];
            const headerRow = refSheet.addRow(refHeaders);
            headerRow.eachCell(cell => { Object.assign(cell, headerStyle); });

            const maxLen = Math.max(
                taskTypeNames.length, departments.length, redirects.length,
                hreflangTemplates.length, priorities.length, cmsList.length, boolValues.length,
                taskIndexes.length, subtaskNames.length, ampValues.length
            );

            for (let i = 0; i < maxLen; i++) {
                refSheet.addRow([
                    taskTypeNames[i] || '',
                    departments[i] || '',
                    redirects[i] || '',
                    hreflangTemplates[i] || '',
                    priorities[i] || '',
                    cmsList[i] || '',
                    boolValues[i] || '',
                    taskIndexes[i] || '',
                    subtaskNames[i] || '',
                    ampValues[i] || ''
                ]);
            }

            refSheet.columns = [
                { width: 25 }, { width: 15 }, { width: 10 }, { width: 25 }, { width: 12 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 30 }, { width: 15 }
            ];

            // === ЛИСТ 2: Задачи ===
            const tasksSheet = wb.addWorksheet('Задачи');

            const taskHeaders = ['№', 'taskName', 'department', 'domain', 'oldSub', 'redirect', 'newSub', 'toUrl', 'oldUrl', 'alternateDomain', 'hreflang', 'priority', 'cms', 'dmca', 'amp', 'assignee', 'pingRocket', 'notes'];
            const taskHints = ['1,2,3...', 'Тип задачи', 'Отдел', 'example.com', 'old.example.com', '301/404/-', 'new.example.com', 'URL дропа (301/404)', 'URL для 404', 'alt-domain.com', 'RU/AZ/KZ', 'High/Medium/Low', 'CMS', 'true/false', 'domain/subdomain/both', 'Имя', 'true/false', 'Примечания'];

            const taskHeaderRow = tasksSheet.addRow(taskHeaders);
            taskHeaderRow.eachCell(cell => { Object.assign(cell, headerStyle); });

            const taskHintRow = tasksSheet.addRow(taskHints);
            taskHintRow.eachCell(cell => { Object.assign(cell, hintStyle); });

            // Добавляем задачи если есть
            if (this.tasks.length) {
                this.tasks.forEach((t, idx) => {
                    const redirect = t.redirect301 ? '301' : (t.redirect404 ? '404' : '-');
                    const hreflang = hreflangNames[t.templateIndex] || hreflangTemplates[0] || 'RU';
                    tasksSheet.addRow([
                        idx + 1,
                        t.taskName || '',
                        t.department || '',
                        t.domain || '',
                        t.oldSub || '',
                        redirect,
                        t.newSub || '',
                        t.toUrl || '',
                        t.oldUrl || '',
                        t.alternateDomain || '',
                        hreflang,
                        t.priority || '',
                        t.cms || '',
                        t.dmca ? 'true' : 'false',
                        t.amp || '',  // v4.6.17: domain/subdomain/both или пусто
                        assigneeIdToName(t.assignee),
                        t.pingRocket ? 'true' : 'false',
                        t.notes || ''
                    ]);
                });
            }

            tasksSheet.columns = [
                { width: 5 }, { width: 22 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 10 },
                { width: 22 }, { width: 25 }, { width: 30 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 12 }, { width: 8 },
                { width: 8 }, { width: 18 }, { width: 10 }, { width: 25 }
            ];

            // Data Validation (выпадающие списки)
            const taskTypeFormula = `'Справочники'!$A$2:$A$${taskTypeNames.length + 1}`;
            const deptFormula = `'Справочники'!$B$2:$B$${departments.length + 1}`;
            const redirectFormula = `'Справочники'!$C$2:$C$${redirects.length + 1}`;
            const hreflangFormula = `'Справочники'!$D$2:$D$${hreflangTemplates.length + 1}`;
            const priorityFormula = `'Справочники'!$E$2:$E$${priorities.length + 1}`;
            const cmsFormula = `'Справочники'!$F$2:$F$${cmsList.length + 1}`;
            const boolFormula = `'Справочники'!$G$2:$G$3`;
            const ampFormula = `'Справочники'!$J$2:$J$${ampValues.length + 1}`;  // v4.6.17: отдельная формула для AMP

            // B: taskName
            tasksSheet.dataValidations.add('B3:B1000', {
                type: 'list', allowBlank: true, formulae: [taskTypeFormula]
            });
            // C: department
            tasksSheet.dataValidations.add('C3:C1000', {
                type: 'list', allowBlank: true, formulae: [deptFormula]
            });
            // F: redirect
            tasksSheet.dataValidations.add('F3:F1000', {
                type: 'list', allowBlank: true, formulae: [redirectFormula]
            });
            // K: hreflang (было I, добавили toUrl=H, oldUrl=I, alternateDomain=J)
            tasksSheet.dataValidations.add('K3:K1000', {
                type: 'list', allowBlank: true, formulae: [hreflangFormula]
            });
            // L: priority
            tasksSheet.dataValidations.add('L3:L1000', {
                type: 'list', allowBlank: true, formulae: [priorityFormula]
            });
            // M: cms
            tasksSheet.dataValidations.add('M3:M1000', {
                type: 'list', allowBlank: true, formulae: [cmsFormula]
            });
            // N: dmca
            tasksSheet.dataValidations.add('N3:N1000', {
                type: 'list', allowBlank: true, formulae: [boolFormula]
            });
            // O: amp - v4.6.17: теперь domain/subdomain/both
            tasksSheet.dataValidations.add('O3:O1000', {
                type: 'list', allowBlank: true, formulae: [ampFormula]
            });
            // Q: pingRocket
            tasksSheet.dataValidations.add('Q3:Q1000', {
                type: 'list', allowBlank: true, formulae: [boolFormula]
            });

            // Закрепляем строки
            tasksSheet.views = [{ state: 'frozen', ySplit: 2 }];

            // === ЛИСТ 3: Подзадачи ===
            const subsSheet = wb.addWorksheet('Подзадачи');

            const subHeaders = ['taskIndex', 'name', 'priority', 'percent', 'assignee'];
            const subHints = ['№ задачи', 'Название', 'High/Medium/Low', '10-100', 'Имя'];

            const subHeaderRow = subsSheet.addRow(subHeaders);
            subHeaderRow.eachCell(cell => { Object.assign(cell, headerStyle); });

            const subHintRow = subsSheet.addRow(subHints);
            subHintRow.eachCell(cell => { Object.assign(cell, hintStyle); });

            if (this.tasks.length) {
                this.tasks.forEach((t, idx) => {
                    if (t.subtasks && t.subtasks.length > 0) {
                        t.subtasks.forEach(s => {
                            subsSheet.addRow([
                                idx + 1,
                                s.name || '',
                                s.priority || 'medium',
                                s.allocation || 100,
                                gidToName(s.assignee)
                            ]);
                        });
                    }
                });
            }

            subsSheet.columns = [{ width: 12 }, { width: 40 }, { width: 15 }, { width: 12 }, { width: 20 }];

            // taskIndex validation - ссылка на номера из справочников
            const taskIndexFormula = `'Справочники'!$H$2:$H$51`;
            subsSheet.dataValidations.add('A3:A500', {
                type: 'list', allowBlank: true, formulae: [taskIndexFormula]
            });

            // name validation - ссылка на названия подзадач из справочников
            const subtaskNameFormula = `'Справочники'!$I$2:$I$${subtaskNames.length + 1}`;
            subsSheet.dataValidations.add('B3:B500', {
                type: 'list', allowBlank: true, formulae: [subtaskNameFormula]
            });

            // priority validation
            subsSheet.dataValidations.add('C3:C500', {
                type: 'list', allowBlank: true, formulae: [priorityFormula]
            });

            subsSheet.views = [{ state: 'frozen', ySplit: 2 }];

            // === ЛИСТ 4: Типовые подзадачи ===
            const typicalSheet = wb.addWorksheet('Типовые подзадачи');

            const titleRow = typicalSheet.addRow(['📋 ТИПОВЫЕ ПОДЗАДАЧИ — копируй в лист Подзадачи']);
            titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
            typicalSheet.mergeCells('A1:E1');

            typicalSheet.addRow([]);

            // Группируем по категориям шаблонов (не по отделам)
            let hasTemplates = false;
            for (const key of allTemplateKeys) {
                const keyTemplates = subtaskTemplates[key];
                if (!keyTemplates || keyTemplates.length === 0) continue;

                hasTemplates = true;
                const catRow = typicalSheet.addRow([`📁 ${key}`]);
                catRow.getCell(1).font = categoryStyle.font;
                catRow.getCell(1).fill = categoryStyle.fill;
                typicalSheet.mergeCells(`A${catRow.number}:E${catRow.number}`);

                const subHeadRow = typicalSheet.addRow(['taskIndex', 'name', 'priority', 'percent', 'assignee']);
                subHeadRow.eachCell(cell => {
                    cell.font = { bold: true, size: 10 };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
                });

                keyTemplates.forEach(tmpl => {
                    typicalSheet.addRow([
                        '',
                        tmpl.name || '',
                        tmpl.priority || 'medium',
                        tmpl.allocation || 100,
                        ''
                    ]);
                });

                typicalSheet.addRow([]);
            }

            // Добавляем стандартные если нет шаблонов
            if (!hasTemplates) {
                const defaultTypical = {
                    '🌐 Смена поддомена': [
                        ['', 'SEO проверка', 'High', 100, ''],
                        ['', 'DEV реализация', 'High', 100, ''],
                        ['', 'Актуализация ссылок', 'Medium', 50, ''],
                        ['', 'Проверка редиректов', 'Medium', 30, '']
                    ],
                    '↪️ Редиректы': [
                        ['', 'Настройка редиректа', 'High', 100, ''],
                        ['', 'Проверка цепочек', 'Medium', 50, '']
                    ],
                    '🏷️ Hreflang': [
                        ['', 'Добавить hreflang теги', 'High', 100, ''],
                        ['', 'Проверка canonical', 'Medium', 50, '']
                    ],
                    '🔍 SEO аудит': [
                        ['', 'Анализ мета-тегов', 'High', 100, ''],
                        ['', 'Проверка скорости', 'Medium', 50, '']
                    ]
                };

                for (const [cat, items] of Object.entries(defaultTypical)) {
                    const catRow = typicalSheet.addRow([cat]);
                    catRow.getCell(1).font = categoryStyle.font;
                    catRow.getCell(1).fill = categoryStyle.fill;
                    typicalSheet.mergeCells(`A${catRow.number}:E${catRow.number}`);

                    const subHeadRow = typicalSheet.addRow(['taskIndex', 'name', 'priority', 'percent', 'assignee']);
                    subHeadRow.eachCell(cell => {
                        cell.font = { bold: true, size: 10 };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
                    });

                    items.forEach(row => typicalSheet.addRow(row));
                    typicalSheet.addRow([]);
                }
            }

            typicalSheet.columns = [{ width: 12 }, { width: 35 }, { width: 15 }, { width: 12 }, { width: 20 }];

            // taskIndex validation для типовых подзадач - ссылка на номера из справочников
            typicalSheet.dataValidations.add('A3:A500', {
                type: 'list', allowBlank: true, formulae: [taskIndexFormula]
            });

            // name validation для типовых подзадач
            typicalSheet.dataValidations.add('B3:B500', {
                type: 'list', allowBlank: true, formulae: [subtaskNameFormula]
            });

            // === СОХРАНЕНИЕ ===
            const filename = this.tasks.length
                ? `subdomain_tasks_${new Date().toISOString().slice(0,10)}.xlsx`
                : `tasks_template_${new Date().toISOString().slice(0,10)}.xlsx`;

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            if (!this.tasks.length) {
                showToast(' Экспортирован шаблон с вашими настройками и выпадающими списками');
            }
        }

        attachEventListeners() {
            const root = this.shadowRoot;

            // v4.6.17: Глобальный обработчик для кнопки настроек через делегирование на shadowRoot
            root.addEventListener('click', (e) => {
                const settingsBtn = e.target.closest('#open-settings');
                if (settingsBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔧 Глобальный клик по open-settings');
                    this.openSettingsModal();
                }
            });

            // v4.5.5: Крестик скрывает окно, но не прерывает процессы
            root.getElementById('close-dashboard').addEventListener('click', () => {
                if (this.isProcessing) {
                    showToast('⏳ Процесс продолжается в фоне...', 'info', 3000);
                }
                this.hide();
            });

            // Переключатели режимов v4.0
            root.getElementById('mode-btn-single').addEventListener('click', () => this.switchMode('single'));
            root.getElementById('mode-btn-mass').addEventListener('click', () => this.switchMode('mass'));

            // Кнопки массового режима - используем делегирование через mass-mode-container
            const massContainer = root.getElementById('mass-mode-container');
            if (massContainer) {
                massContainer.addEventListener('click', (e) => {
                    const target = e.target;
                    if (target.id === 'add-task-btn' || target.closest('#add-task-btn')) {
                        e.preventDefault();
                        this.addTask();
                    } else if (target.id === 'duplicate-selected-btn' || target.closest('#duplicate-selected-btn')) {
                        this.duplicateSelectedTasks();
                    } else if (target.id === 'clear-all-tasks' || target.closest('#clear-all-tasks')) {
                        const selectedIds = this.getSelectedTaskIds();
                        if (selectedIds.length > 0) {
                            this.clearSelectedTasks();
                        } else {
                            this.clearAllTasks();
                        }
                    } else if (target.id === 'import-tasks-btn' || target.closest('#import-tasks-btn')) {
                        this.importTasks();
                    } else if (target.id === 'export-tasks-btn' || target.closest('#export-tasks-btn')) {
                        this.exportTasks(); // Экспорт таблицы (шаблон Excel)
                    } else if (target.id === 'open-settings' || target.closest('#open-settings')) {
                        // v4.6.17: Кнопка настроек API
                        console.log('🔧 Клик по open-settings, target:', target.id, target);
                        this.openSettingsModal();
                    } else if (target.id === 'open-history-mass' || target.closest('#open-history-mass')) {
                        this.openAutomationHistoryModal();
                    } else if (target.id === 'process-all-tasks' || target.closest('#process-all-tasks')) {
                        this.processAllTasks();
                    // v4.5.0: Кнопка выгрузки ТЗ
                    } else if (target.id === 'generate-summary-btn' || target.closest('#generate-summary-btn')) {
                        this.generateSummaryReport(); // Генерация ТЗ
                    // v4.5.0: Кнопка облачного сохранения
                    } else if (target.id === 'generate-cloud-btn' || target.closest('#generate-cloud-btn')) {
                        this.generateCloudReport();
                    // v4.5.0: Кнопка объединённых настроек полей
                    } else if (target.id === 'open-unified-settings-btn' || target.closest('#open-unified-settings-btn')) {
                        this.openUnifiedSettingsModal();
                    }
                });
            }

            // События для основного домена (история + автокомплит)
            const domainInput = root.getElementById('domain');
            domainInput.addEventListener('input', (e) => {
                e.stopPropagation();
                this.updateOldSubHistory(e);
                this.handleDomainInput(e);
                this.updateOldSubDatabaseList(e.target.value.trim());
            });
            domainInput.addEventListener('focus', (e) => {
                e.stopPropagation();
                this.showOldSubHistory();
                this.showAutocomplete();
            });
            domainInput.addEventListener('blur', (e) => {
                e.stopPropagation();
                // Скрываем историю и автокомплит с задержкой, чтобы успеть кликнуть
                setTimeout(() => {
                    this.hideOldSubHistory();
                    this.hideAutocomplete();
                }, 200);
            });
            domainInput.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });

            root.getElementById('manage-templates').addEventListener('click', () => this.openTemplateManager());
            root.getElementById('process-automation').addEventListener('click', () => this.processAutomation());
            root.getElementById('add-subtask').addEventListener('click', () => this.addSubtask());
            root.getElementById('open-subtask-templates').addEventListener('click', () => this.openSubtaskTemplatesModal());
            const openSettingsSingleBtn = root.getElementById('open-settings-single');
            if (openSettingsSingleBtn) {
                openSettingsSingleBtn.addEventListener('click', () => this.openSettingsModal());
            }
            // v4.6.17: Прямой обработчик для кнопки настроек в массовом режиме
            const openSettingsMassBtn = root.getElementById('open-settings');
            console.log('🔧 open-settings кнопка найдена:', openSettingsMassBtn);
            if (openSettingsMassBtn) {
                openSettingsMassBtn.addEventListener('click', (e) => {
                    console.log('🔧 Клик по кнопке настроек');
                    e.preventDefault();
                    e.stopPropagation();
                    this.openSettingsModal();
                });
            } else {
                console.warn('⚠️ Кнопка open-settings не найдена!');
            }
            root.getElementById('open-history-modal').addEventListener('click', () => this.openAutomationHistoryModal());
            root.getElementById('manage-domains-unified').addEventListener('click', () => this.openUnifiedDomainsModal());
            root.getElementById('manage-history').addEventListener('click', () => this.openSubdomainManagerModal('oldSub'));
            // v4.5.7: Обработчик для oldUrl
            root.getElementById('manage-oldurl').addEventListener('click', () => {
                showToast('Введите URL для 404 по одному на строку', 'info', 3000);
                root.getElementById('oldUrl').focus();
            });
            root.getElementById('clear-selected-domains').addEventListener('click', () => this.clearSelectedDomains());

            // Проверка www при изменении поддоменов
            // v4.3.0: Унифицированные обработчики для oldSub
            root.getElementById('oldSub').addEventListener('input', (e) => {
                e.stopPropagation();
                this.showFieldAutocomplete('oldSub', 'oldSub');
                this.checkWwwConsistency();
            });
            root.getElementById('oldSub').addEventListener('focus', (e) => {
                e.stopPropagation();
                this.showFieldAutocomplete('oldSub', 'oldSub');
            });
            root.getElementById('oldSub').addEventListener('blur', (e) => {
                e.stopPropagation();
                setTimeout(() => this.hideFieldAutocomplete('oldSub'), 200);
                this.checkWwwConsistency();
            });
            root.getElementById('oldSub').addEventListener('keydown', (e) => e.stopPropagation());

            // v4.3.0: Унифицированные обработчики для newSub
            root.getElementById('newSub').addEventListener('input', (e) => {
                e.stopPropagation();
                this.showFieldAutocomplete('newSub', 'newSub');
                this.checkWwwConsistency();
            });
            root.getElementById('newSub').addEventListener('focus', (e) => {
                e.stopPropagation();
                this.showFieldAutocomplete('newSub', 'newSub');
            });
            root.getElementById('newSub').addEventListener('blur', (e) => {
                e.stopPropagation();
                setTimeout(() => this.hideFieldAutocomplete('newSub'), 200);
                this.checkWwwConsistency();
            });
            root.getElementById('newSub').addEventListener('keydown', (e) => e.stopPropagation());

            // v4.5.8: stopPropagation для новых полей
            ['toUrl', 'oldUrl', 'alternateDomain'].forEach(fieldId => {
                const el = root.getElementById(fieldId);
                if (el) {
                    el.addEventListener('keydown', (e) => e.stopPropagation());
                    el.addEventListener('keyup', (e) => e.stopPropagation());
                    el.addEventListener('keypress', (e) => e.stopPropagation());
                }
            });
        }

        handleDomainInput(e) {
            const value = e.target.value.trim();
            if(DEBUG) console.log('📝 handleDomainInput:', value);
            this.updateOldSubHistory(e);
            this.showAutocomplete();
            this.validateDomainInput(value);
        }

        // v4.3.0: Унифицированный автокомплит для всех полей
        showFieldAutocomplete(fieldId, type) {
            const input = this.shadowRoot.getElementById(fieldId);
            const autocompleteDiv = this.shadowRoot.getElementById(fieldId + '-autocomplete');

            if(DEBUG) console.log('showFieldAutocomplete:', fieldId, type, 'input:', !!input, 'div:', !!autocompleteDiv);

            if (!input || !autocompleteDiv) {
                if(DEBUG) console.log('❌ Элемент не найден:', fieldId);
                return;
            }

            const value = input.value.trim();
            const currentDomain = this.shadowRoot.getElementById('domain').value.trim();

            autocompleteDiv.innerHTML = '';

            let items = [];

            if (type === 'domain') {
                // v4.3.5: При пустом поле не показываем ничего, только при вводе
                if (value.length > 0) {
                    items = searchDomains(value).map(item => ({
                        value: item.domain,
                        meta: (item.department || 'Без отдела') + ' • ' + (item.cms || 'CMS не указана'),
                        data: item
                    }));
                }
                // Если пусто - items остаётся пустым, автокомплит не покажется
                if(DEBUG) console.log('Domain search results:', items.length, 'query:', value);
            } else if (type === 'oldSub') {
                // v4.5.7: Поиск по oldSubdomains + currentSubdomain текущего домена
                const db = loadSitesDatabase();
                const normalized = normalizeDomain(currentDomain);
                if(DEBUG) {
                    console.log('━━━━━━━ oldSub DEBUG ━━━━━━━');
                    console.log('currentDomain (из поля):', currentDomain);
                    console.log('normalized:', normalized);
                    console.log('Домены в базе:', Object.keys(db));
                }
                let site = null;
                let foundKey = null;
                for (const d in db) {
                    const dbNormalized = normalizeDomain(d);
                    if(DEBUG) console.log(`   Сравнение: "${dbNormalized}" === "${normalized}" ?`, dbNormalized === normalized);
                    if (db[d].status === 'active' && dbNormalized === normalized) {
                        site = db[d];
                        foundKey = d;
                        if(DEBUG) console.log('✓ Найден сайт:', d, 'oldSubdomains:', site.oldSubdomains, 'currentSubdomain:', site.currentSubdomain);
                        break;
                    }
                }
                if (!site && DEBUG) console.log('✗ Сайт НЕ найден в базе');
                // v4.5.7: Показываем oldSubdomains + currentSubdomain
                if (site && value.length > 0) {
                    // Сначала добавляем currentSubdomain (текущий, который отключаем)
                    if (site.currentSubdomain && site.currentSubdomain.toLowerCase().includes(value.toLowerCase())) {
                        items.push({
                            value: site.currentSubdomain,
                            meta: '[ТЕКУЩИЙ] → будет отключён',
                            data: { url: site.currentSubdomain, action: '404', isCurrent: true }
                        });
                    }
                    // Затем oldSubdomains
                    if (site.oldSubdomains) {
                        const oldItems = site.oldSubdomains
                            .filter(s => s.url.toLowerCase().includes(value.toLowerCase()))
                            .map(s => ({
                                value: s.url,
                                meta: '[' + (s.action || '404') + ']' + (s.usedDate ? ' • ' + s.usedDate : ''),
                                data: s
                            }));
                        items.push(...oldItems);
                    }
                    if(DEBUG) console.log('oldSub items (после фильтра):', items.length, items);
                }
                if(DEBUG) console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
            } else if (type === 'newSub') {
                // v4.5.7: Новый поддомен - НЕ показываем автокомплит (вводится вручную)
                // Поле для НОВОГО поддомена, которого ещё нет в базе
                if(DEBUG) {
                    console.log('━━━━━━━ newSub DEBUG ━━━━━━━');
                    console.log('newSub: автокомплит отключён - вводится вручную');
                    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
                }
                // items остаётся пустым - автокомплит не показывается
            }

            if (items.length > 0) {
                items.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'autocomplete-item';

                    const valueSpan = document.createElement('div');
                    valueSpan.className = 'autocomplete-domain';
                    valueSpan.textContent = item.value;

                    const metaSpan = document.createElement('div');
                    metaSpan.className = 'autocomplete-meta';
                    metaSpan.textContent = item.meta;

                    itemDiv.appendChild(valueSpan);
                    itemDiv.appendChild(metaSpan);

                    itemDiv.addEventListener('click', () => {
                        this.selectAutocompleteItem(fieldId, type, item);
                    });

                    autocompleteDiv.appendChild(itemDiv);
                });
                autocompleteDiv.classList.add('active');
                if(DEBUG) console.log('✓ Показан автокомплит с', items.length, 'результатами');
            } else if (type === 'domain' && value.length > 0) {
                // Для домена показываем сообщение если ничего не найдено
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'autocomplete-empty';
                emptyDiv.textContent = 'Домен не найден в базе';
                autocompleteDiv.appendChild(emptyDiv);
                autocompleteDiv.classList.add('active');
                if(DEBUG) console.log('⚠ Домен не найден в базе');
            } else if (value.length > 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'autocomplete-empty';
                emptyDiv.textContent = type === 'oldSub' ? 'Нет в истории' : 'Нет данных';
                autocompleteDiv.appendChild(emptyDiv);
                autocompleteDiv.classList.add('active');
            } else {
                this.hideFieldAutocomplete(fieldId);
            }
        }

        hideFieldAutocomplete(fieldId) {
            const autocompleteDiv = this.shadowRoot.getElementById(fieldId + '-autocomplete');
            if (autocompleteDiv) {
                autocompleteDiv.classList.remove('active');
            }
        }

        hideAllAutocomplete() {
            ['domain', 'oldSub', 'newSub'].forEach(id => this.hideFieldAutocomplete(id));
        }

        selectAutocompleteItem(fieldId, type, item) {
            const input = this.shadowRoot.getElementById(fieldId);
            if (!input) return;

            input.value = item.value;
            this.hideFieldAutocomplete(fieldId);

            if (type === 'domain' && item.data) {
                // Автозаполнение отдела и CMS
                const dept = this.shadowRoot.getElementById('department');
                const cms = this.shadowRoot.getElementById('cms');
                if (dept && item.data.department) dept.value = item.data.department;
                if (cms && item.data.cms) cms.value = item.data.cms;
            }

            // v4.3.7: Установка флагов редиректа при выборе oldSub
            if (type === 'oldSub' && item.data) {
                const redirectType = item.data.action || '301';
                const redirect301 = this.shadowRoot.getElementById('redirect301');
                const redirect404 = this.shadowRoot.getElementById('redirect404');
                if (redirect301) redirect301.checked = (redirectType === '301');
                if (redirect404) redirect404.checked = (redirectType === '404');
            }

            // Запускаем валидацию
            this.validateInputField(fieldId, type, type === 'domain' ? '' : this.shadowRoot.getElementById('domain').value.trim());
        }

        // Обёртки для обратной совместимости
        showAutocomplete() {
            this.showFieldAutocomplete('domain', 'domain');
        }

        hideAutocomplete() {
            this.hideFieldAutocomplete('domain');
        }

        // FIX v4.1.9: Обновить datalist oldSub из базы
        // v4.3.3: Устаревшая функция - теперь используется унифицированный автокомплит
        updateOldSubDatabaseList(domain) {
            // Заглушка - функционал перенесён в showFieldAutocomplete('oldSub', 'oldSub')
        }

        // v4.2.0: checkOldSubWithDatabase теперь часть checkWwwConsistency
        checkOldSubWithDatabase() {
            // Вся логика теперь в checkWwwConsistency
            this.checkWwwConsistency();
        }

        // FIX v4.1.9: Валидация oldSub - делегируем к классу MassTasksInterface
        validateOldSubWithDatabase(domain, oldSub) {
            if (!domain || !oldSub) return { valid: true, inHistory: false };

            const db = loadSitesDatabase();
            const normalized = normalizeDomain(domain);

            let site = db[domain];
            if (!site) {
                for (const d in db) {
                    if (normalizeDomain(d) === normalized) {
                        site = db[d];
                        break;
                    }
                }
            }

            if (!site || !site.oldSubdomains) {
                return { valid: true, inHistory: false, message: 'Новый поддомен (не в истории)' };
            }

            const normalizedOldSub = normalizeDomain(oldSub);
            const found = site.oldSubdomains.find(s => normalizeDomain(s.url) === normalizedOldSub);

            if (found) {
                const inputHasWww = oldSub.toLowerCase().replace(/^https?:\/\//, '').startsWith('www.');
                const dbHasWww = found.url.toLowerCase().replace(/^https?:\/\//, '').startsWith('www.');

                if (inputHasWww !== dbHasWww) {
                    return {
                        valid: true,
                        inHistory: true,
                        wwwMismatch: true,
                        dbValue: found.url,
                        action: found.action,
                        message: `В базе: ${found.url} (${dbHasWww ? 'с www' : 'без www'})`
                    };
                }

                return {
                    valid: true,
                    inHistory: true,
                    exactMatch: true,
                    dbValue: found.url,
                    action: found.action,
                    message: `Найден в истории (action: ${found.action})`
                };
            }

            return { valid: true, inHistory: false, message: 'Новый поддомен (не в истории)' };
        }

        selectDomain(domainData) {
            const domainInput = this.shadowRoot.getElementById('domain');
            const departmentSelect = this.shadowRoot.getElementById('department');
            const cmsSelect = this.shadowRoot.getElementById('cms');

            // Заполняем домен
            domainInput.value = domainData.domain;

            // Автозаполняем отдел
            if (domainData.department && departmentSelect) {
                departmentSelect.value = domainData.department;
            }

            // Автозаполняем CMS
            if (domainData.cms && cmsSelect) {
                cmsSelect.value = domainData.cms;
            }

            // FIX v4.1.9: Обновляем datalist oldSub из базы
            this.updateOldSubDatabaseList(domainData.domain);

            this.hideAutocomplete();
            this.validateDomainInput(domainData.domain);

            // Автозаполнение дополнительных полей из sitesDatabase
            const site = getSite(domainData.domain);
            if (site) {
                // Шаблон hreflang
                const tplSelect = this.shadowRoot.getElementById('hreflangTemplate');
                if (tplSelect && site.hreflangTemplate) {
                    tplSelect.value = site.hreflangTemplate;
                }

                // Чекбокс AMP
                const ampCheck = this.shadowRoot.getElementById('hasAmp');
                if (ampCheck && site.hasAMP) {
                    ampCheck.checked = true;
                }

                // Чекбокс DMCA
                const dmcaCheck = this.shadowRoot.getElementById('dmca');
                if (dmcaCheck && site.dmcaDefault) {
                    dmcaCheck.checked = true;
                }
            }

            // Показываем историю старых поддоменов
            this.currentDomain = domainData.domain;
            this.showOldSubHistory();
        }

        // v4.2.0: Валидация домена с цветом рамки
        // v4.2.2: Универсальная валидация для всех полей
        validateInputField(inputId, type, relatedDomain = '') {
            const input = this.shadowRoot.getElementById(inputId);
            if (!input) {
                if(DEBUG) console.log('❌ validateInputField: input не найден', inputId);
                return;
            }

            const value = input.value.trim();
            const parent = input.closest('.input-with-settings') || input.closest('.form-group') || input.parentElement;

            if(DEBUG) console.log('🔍 validateInputField START:', inputId, 'value:', value);

            // Убираем старые классы и tooltip
            input.classList.remove('input-valid', 'input-error');
            const oldTooltip = parent.querySelector('.input-warning-tooltip');
            if (oldTooltip) oldTooltip.remove();

            if (!value) {
                if(DEBUG) console.log('   → пустое значение, выход');
                return;
            }

            // Для домена relatedDomain пустой, для oldSub/newSub - текущий домен
            const domain = type === 'domain' ? '' : relatedDomain;
            const validation = validateWithDatabase(type, domain, value);

            if(DEBUG) console.log('   → validation result:', validation.status, validation.message);

            // v4.3.2: Единая логика для всех полей - красная рамка при not-found или www-mismatch
            if (validation.status === 'valid') {
                input.classList.add('input-valid');
                if(DEBUG) console.log('   → ✓ добавлен класс input-valid');
            } else if (validation.status === 'www-mismatch' || validation.status === 'not-found') {
                input.classList.add('input-error');
                if(DEBUG) console.log('   → ✗ добавлен класс input-error');
                // Показываем tooltip с сообщением
                if (validation.message) {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'input-warning-tooltip';
                    tooltip.textContent = validation.message;
                    parent.style.position = 'relative';
                    parent.appendChild(tooltip);
                    if(DEBUG) console.log('   → tooltip добавлен:', validation.message);
                    setTimeout(() => { if (tooltip.parentElement) tooltip.remove(); }, 5000);
                }
            } else {
                if(DEBUG) console.log('   → другой статус, без класса');
            }
        }

        // Обёртки для обратной совместимости
        validateDomainInput(domain) {
            if(DEBUG) console.log('🔄 validateDomainInput вызван');
            this.validateInputField('domain', 'domain');
        }

        checkWwwConsistency() {
            const domain = this.shadowRoot.getElementById('domain').value.trim();

            // Скрываем старые подсказки (если есть)
            const hintDiv = this.shadowRoot.getElementById('www-hint');
            const comparisonDiv = this.shadowRoot.getElementById('www-comparison');
            if (hintDiv) hintDiv.style.display = 'none';
            if (comparisonDiv) comparisonDiv.style.display = 'none';

            // Валидация oldSub и newSub
            this.validateInputField('oldSub', 'oldSub', domain);
            this.validateInputField('newSub', 'newSub', domain);
        }

        // Deprecated - оставлено для совместимости
        validateSingleInput(input, type, domain, value, isRequired) {
            this.validateInputField(input.id, type, domain);
        }

        // v4.3.3: Устаревшая функция - теперь используется унифицированный автокомплит
        updateOldSubHistory(e) {
            // Заглушка - функционал перенесён в showFieldAutocomplete
            const domain = e.target.value.trim();
            this.currentDomain = domain;
        }

        // v4.3.3: Устаревшие функции - теперь используется унифицированный автокомплит
        showOldSubHistory() {
            // Заглушка - функционал перенесён в showFieldAutocomplete('oldSub', 'oldSub')
        }

        hideOldSubHistory() {
            // Заглушка - функционал перенесён в hideFieldAutocomplete('oldSub')
        }

        populateTemplateSelect() {
            const select = this.shadowRoot.getElementById('templateSelect');
            select.innerHTML = '';
            const templates = loadTemplates();
            templates.forEach((tpl, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = tpl.name;
                select.appendChild(opt);
            });
        }

        populateDepartmentSelect() {
            const select = this.shadowRoot.getElementById('department');
            if (!select) return;

            const currentVal = select.value;
            select.innerHTML = '<option value="">Выберите отдел</option>';
            const depts = getDepartmentsList();
            depts.forEach(dept => {
                const opt = document.createElement('option');
                opt.value = dept;
                opt.textContent = dept;
                select.appendChild(opt);
            });
            if (currentVal) select.value = currentVal;
        }

        populateCmsSelect() {
            const select = this.shadowRoot.getElementById('cms');
            if (!select) return;

            const currentVal = select.value;
            select.innerHTML = '<option value="">— Не указано —</option>';
            const cmsList = getCmsList();
            cmsList.forEach(cms => {
                const opt = document.createElement('option');
                opt.value = cms.key;
                opt.textContent = cms.name;
                select.appendChild(opt);
            });
            if (currentVal) select.value = currentVal;
        }

        openTemplateManager() {
            const modal = new TemplateModal(this.shadowRoot, () => {
                // v4.3.7: Обновляем select в одиночном режиме
                this.populateTemplateSelect();

                // v4.3.7: Если активен массовый режим - перерендериваем таблицу
                if (this.currentMode === 'mass') {
                    this.renderTasksTable();
                }
            });
            modal.show();
        }

        collectFormData() {
            const root = this.shadowRoot;
            return {
                taskName: root.getElementById('taskName').value.trim(),
                domain: root.getElementById('domain').value.trim(),
                department: root.getElementById('department').value,
                oldSub: root.getElementById('oldSub').value.trim(),
                newSub: root.getElementById('newSub').value.trim(),
                // v4.5.7: Новые поля
                toUrl: root.getElementById('toUrl')?.value.trim() || '',
                oldUrl: root.getElementById('oldUrl')?.value.trim() || '',
                alternateDomain: root.getElementById('alternateDomain')?.value.trim() || '',
                templateIndex: root.getElementById('templateSelect').value,
                priority: root.getElementById('priority').value,
                cms: root.getElementById('cms').value,
                dmca: root.getElementById('dmca').checked,
                amp: root.getElementById('amp').value,
                redirect301: root.getElementById('redirect301').checked,
                redirect404: root.getElementById('redirect404').checked
            };
        }

        validateFormData(data) {
            if (!data.taskName || !data.domain || !data.department || !data.oldSub || !data.newSub || data.templateIndex === '' || !data.priority) {
                showToast('Пожалуйста, заполните все обязательные поля (отмечены *)');
                return false;
            }
            return true;
        }

        showStatusLog() {
            this.shadowRoot.getElementById('status-log').style.display = 'block';
            this.shadowRoot.getElementById('log-content').innerHTML = '';
            
            // v4.5.5: Кнопка копирования лога
            const copyBtn = this.shadowRoot.getElementById('copy-log-btn');
            if (copyBtn && !copyBtn._hasListener) {
                copyBtn._hasListener = true;
                copyBtn.addEventListener('click', () => this.copyLog());
            }
        }

        // v4.5.5: Копирование лога в буфер обмена
        copyLog() {
            const logContent = this.shadowRoot.getElementById('log-content');
            const lines = Array.from(logContent.querySelectorAll('div')).map(d => d.textContent);
            const text = lines.join('\n');
            
            navigator.clipboard.writeText(text).then(() => {
                const btn = this.shadowRoot.getElementById('copy-log-btn');
                btn.textContent = '✓ Скопировано';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = '📋 Копировать';
                    btn.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                showToast('Не удалось скопировать: ' + err.message, 'error');
            });
        }

        // v4.5.5: Управление глобальным прогресс-баром
        showProgress(show = true) {
            const progress = this.shadowRoot.getElementById('global-progress');
            if (progress) progress.style.display = show ? 'block' : 'none';
        }

        updateProgress(current, total, text = null) {
            const bar = this.shadowRoot.getElementById('global-progress-bar');
            const textEl = this.shadowRoot.getElementById('global-progress-text');
            if (!bar || !textEl) return;
            
            const percent = Math.round((current / total) * 100);
            bar.style.width = percent + '%';
            textEl.textContent = text || `${current}/${total} (${percent}%)`;
        }

        // v4.5.5: Обновление заголовка с индикатором процесса
        setProcessingState(processing) {
            this.isProcessing = processing;
            const title = this.shadowRoot.getElementById('dashboard-title');
            if (title) {
                if (processing) {
                    title.innerHTML = '⏳ <span style="animation: pulse 1s infinite;">Отправка...</span>';
                    title.style.color = '#ffc107';
                } else {
                    title.innerHTML = '🔧 Смена поддоменов v4.0';
                    title.style.color = '';
                }
            }
        }

        logMessage(message, type = 'info') {
            const logContent = this.shadowRoot.getElementById('log-content');
            const timestamp = new Date().toLocaleTimeString('ru-RU');
            const div = document.createElement('div');
            div.textContent = `[${timestamp}] ${message}`;

            if (type === 'success') {
                div.className = 'log-success';
            } else if (type === 'error') {
                div.className = 'log-error';
            } else if (type === 'warning') {
                div.className = 'log-warning';
            }

            logContent.appendChild(div);
            logContent.scrollTop = logContent.scrollHeight;
        }
        // ===== ОСНОВНАЯ АВТОМАТИЗАЦИЯ =====
        async processAutomation() {
            // Если выбрано несколько доменов - создаём задачи для всех
            if (this.selectedDomains.length > 0) {
                await this.createMultipleTasksFromSelected();
                return;
            }

            // Иначе создаём одну задачу как обычно
            const data = this.collectFormData();

            if (!this.validateFormData(data)) {
                return;
            }

            this.showStatusLog();
            this.logMessage('🚀 Начало автоматизации v2.1...');

            try {
                // Проверяем подключение к Asana
                await this.validateAsanaConnection();

                this.logMessage(`📋 Домен: ${data.domain}`);
                this.logMessage(`🏢 Отдел: ${data.department}`);
                this.logMessage(`📍 ${data.oldSub} → ${data.newSub}`);
                this.logMessage(`⚡ Приоритет: ${data.priority}`);

                addToHistory(data.domain, data.oldSub);

                // FIX v4.1.8: Автообновление базы сайтов
                updateSiteAfterTask(data.domain, {
                    department: data.department,
                    cms: data.cms,
                    hasAMP: data.amp,
                    dmcaDefault: data.dmca,
                    currentSubdomain: data.newSub,
                    lastTaskDate: new Date().toISOString().split('T')[0],
                    oldSubdomain: data.oldSub,
                    redirect301: data.redirect301,
                    redirect404: data.redirect404,
                    // v4.6.17: Новые поля
                    alternateDomain: data.alternateDomain,
                    toUrl: data.toUrl,
                    oldUrl: data.oldUrl
                });

                const tz = this.generateTaskDescription(data);
                this.logMessage('✓ ТЗ сгенерировано', 'success');
                this.logMessage(`📊 Percent Allocation: ${tz.percentAllocation * 100}%${data.amp ? ' (AMP)' : ''}`);

                const taskData = await this.createAsanaTask(data, tz);
                this.logMessage(`✓ Задача создана в Asana: ${taskData.name}`, 'success');
                this.logMessage(`📌 ID задачи: ${taskData.gid}`, 'success');
                this.logMessage(`🔗 Ссылка: https://app.asana.com/0/${CONFIG.asana.projects[data.department]}/${taskData.gid}`, 'success');

                // v4.3.3: Запись в историю автоматизаций
                addToAutomationHistory({
                    taskName: data.taskName,
                    domain: data.domain,
                    oldSub: data.oldSub,
                    newSub: data.newSub,
                    alternateDomain: data.alternateDomain || '',
                    department: data.department,
                    cms: data.cms,
                    template: data.templateName || '',
                    priority: data.priority,
                    redirect301: data.redirect301,
                    redirect404: data.redirect404,
                    hasAMP: data.amp,
                    dmca: data.dmca,
                    asanaTaskId: taskData.gid,
                    asanaTaskUrl: `https://app.asana.com/0/${CONFIG.asana.projects[data.department]}/${taskData.gid}`,
                    status: 'success',
                    mode: 'single',
                    subtasksCount: this.subtasks.length,
                    subtasks: this.subtasks.map(s => ({ name: s.name, priority: s.priority }))
                });

                // Создание подзадач если они есть
                if (this.subtasks.length > 0) {
                    this.logMessage(`📋 Создаю ${this.subtasks.length} подзадач...`);
                    const projectGid = CONFIG.asana.projects[data.department];

                    for (const subtask of this.subtasks) {
                        if (subtask.name.trim()) {
                            try {
                                await this.createAsanaSubtask(
                                    taskData.gid,
                                    subtask,
                                    projectGid,
                                    CONFIG.asana.workspaceGid
                                );
                            } catch (error) {
                                this.logMessage(`   ⚠️ Ошибка создания подзадачи: ${error.message}`, 'error');
                            }
                        }
                    }
                    this.logMessage(`✓ Подзадачи созданы`, 'success');
                }

                if (data.priority === 'high') {
                    this.logMessage('📤 Отправка уведомления в Rocket.Chat...');
                    await this.sendRocketChatNotification(data, taskData);
                    this.logMessage('✓ Уведомление отправлено в Rocket.Chat', 'success');
                }

                this.logMessage('🎉 Автоматизация завершена успешно!', 'success');

            } catch (error) {
                this.logMessage(`❌ Ошибка: ${error.message}`, 'error');
                console.error('Automation error:', error);
            }
        }

        validateAsanaConnection() {
            return new Promise((resolve, reject) => {
                this.logMessage('🔐 Проверка подключения к Asana...');

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://app.asana.com/api/1.0/users/me',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            const result = JSON.parse(response.responseText);
                            this.logMessage(`✓ Подключен как: ${result.data.name}`, 'success');
                            resolve(result.data);
                        } else {
                            this.logMessage(`❌ Ошибка авторизации: ${response.status}`, 'error');
                            reject(new Error('Неверный токен Asana'));
                        }
                    },
                    onerror: () => {
                        reject(new Error('Network error при проверке токена'));
                    }
                });
            });
        }

        generateTaskDescription(data) {
            const templates = loadTemplates();

            // Функция очистки URL
            const cleanUrl = (url) => {
                if (!url) return '';
                return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
            };

            // Очищаем данные
            const domain = cleanUrl(data.domain);
            const oldSub = cleanUrl(data.oldSub);
            const newSub = cleanUrl(data.newSub);

            const hreflangTemplate = data.templateIndex !== undefined && data.templateIndex !== '' ? templates[data.templateIndex] : null;

            // Генерируем hreflang код
            let hreflangCode = '';
            if (hreflangTemplate) {
                hreflangCode = hreflangTemplate.code
                    .replace(/\{\{newSub\}\}/g, newSub)
                    .replace(/\{\{domain\}\}/g, domain);
            } else if (newSub && domain) {
                hreflangCode = `<link rel="canonical" href="https://${newSub}/"/>
<link rel="alternate" hreflang="x-default" href="https://${domain}/"/>
<link rel="alternate" hreflang="ru" href="https://${newSub}/"/>`;
            }

            let taskName = data.taskName || 'Смена поддомена';
            let percentAllocation = 0.03;

            if (data.amp) {
                taskName = data.taskName + ' + AMP';
                percentAllocation = 0.04;
            }

            // Формируем ТЗ согласно шаблону
            let description = '';

            // Блок 1: 301 редирект (если выбран)
            if (data.redirect301) {
                description += `Если есть 301 редирект:

1) Снести 301 редирект с https://${domain}/ на https://${domain}/page/

`;
            }

            // Блок 2: 404 для страниц
            description += `2) Отдать 404 для страниц:
https://${domain}/page/
https://${oldSub}/
https://${domain}/hreflang/ (может быть несколько) и

`;

            // Блок 3: Домен подмены
            description += `Если есть домен-подмена:

3) Домен подмены отключить и не продлять:
https://${oldSub}/

`;

            // Блок 4: Создать страницу на дропе
            description += `4) Создать страницу на дропе (дубль главной):
https://${newSub}/

`;

            // Блок 5: Канониклы и хрефланги
            description += `5) На главной странице и внутряке (https://${domain}/ и https://${newSub}/) прописать канониклы и хрефланги:
${hreflangCode}
Меняем старые канониклы и хрефланги на новые

`;

            // Блок 6: Актуализировать ссылки
            description += `Если надо:

6) Актуализировать ссылки в (выбрать одно или несколько: футере, хедере, боковом меню, sitemap)

`;

            // Блок 7: Важная плашка
            description += `Обратить внимание, что на поддомене в меню должны быть ссылки на внутряки - либо на поддомен, либо поставить заглушки ПП`;

            return {
                name: taskName,
                description: description,
                percentAllocation: percentAllocation
            };
        }

        async createAsanaTask(data, tz) {
            const projectGid = CONFIG.asana.projects[data.department];

            if (!projectGid) {
                throw new Error(`Проект для отдела ${data.department} не найден в конфигурации`);
            }

            // v4.5.0: Если assignee выбран вручную - используем его, иначе автоматический выбор
            const assigneeGid = data.assignee || this.selectAssignee(data.cms, data.department);

            // Используем перераспределение приоритетов
            const dueDate = await this.calculateDueDateWithPrioritySwap(data.priority, assigneeGid);

            this.logMessage(`👤 Назначаю: ${assigneeGid || 'не указан'}${data.assignee ? ' (выбран вручную)' : ' (автомат)'}`);
            this.logMessage(`📅 Срок: ${dueDate}`);

            // Получаем GID опции приоритета
            const priorityOptionGid = CONFIG.asana.customFields.priority.options[data.priority];

            this.logMessage(`🏷️ Custom Fields:`);
            this.logMessage(`   Priority: ${data.priority} (${priorityOptionGid})`);
            this.logMessage(`   Percent Allocation: ${tz.percentAllocation * 100}%`);

            const taskData = {
                data: {
                    name: tz.name,
                    notes: tz.description,
                    projects: [projectGid],
                    workspace: CONFIG.asana.workspaceGid,
                    due_on: dueDate,
                    // Custom fields - workspace-level
                    custom_fields: {
                        [CONFIG.asana.customFields.priority.fieldGid]: priorityOptionGid,
                        [CONFIG.asana.customFields.percentAllocation]: tz.percentAllocation
                    }
                }
            };

            if (assigneeGid) {
                taskData.data.assignee = assigneeGid;
            }

            this.logMessage('📤 Отправка запроса в Asana API...');
            this.logMessage(`📦 Payload custom_fields: ${JSON.stringify(taskData.data.custom_fields)}`);

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://app.asana.com/api/1.0/tasks',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(taskData),
                    onload: (response) => {
                        this.logMessage(`📡 Ответ от Asana: ${response.status}`);

                        if (response.status >= 200 && response.status < 300) {
                            const result = JSON.parse(response.responseText);

                            if (data.dmca) {
                                this.createDMCATasks(data, projectGid);
                            }

                            resolve(result.data);
                        } else {
                            let errorMsg = `Asana API error: ${response.status}`;
                            try {
                                const errorData = JSON.parse(response.responseText);
                                if (errorData.errors && errorData.errors.length > 0) {
                                    errorMsg += ` - ${errorData.errors[0].message}`;
                                    this.logMessage(`Детали: ${JSON.stringify(errorData.errors[0])}`, 'error');
                                }
                            } catch (e) {
                                errorMsg += ` - ${response.responseText}`;
                            }
                            reject(new Error(errorMsg));
                        }
                    },
                    onerror: (error) => {
                        this.logMessage('❌ Network error', 'error');
                        reject(new Error('Network error при создании задачи в Asana'));
                    }
                });
            });
        }

        createDMCATasks(data, projectGid) {
            this.logMessage('📝 Создаю DMCA задачу...');

            // Получаем GID опции приоритета medium для DMCA
            const mediumPriorityGid = CONFIG.asana.customFields.priority.options.medium;

            const dmcaTaskData = {
                data: {
                    name: `DMCA: ${data.domain}`,
                    notes: `Постановка DMCA для поддомена ${data.newSub}`,
                    projects: [projectGid],
                    workspace: CONFIG.asana.workspaceGid,
                    assignee: '1212671934125653',
                    due_on: this.calculateDueDate('medium'),
                    // Custom fields для DMCA задачи
                    custom_fields: {
                        [CONFIG.asana.customFields.priority.fieldGid]: mediumPriorityGid,
                        [CONFIG.asana.customFields.percentAllocation]: 0.01
                    }
                }
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://app.asana.com/api/1.0/tasks',
                headers: {
                    'Authorization': `Bearer ${CONFIG.asana.token}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(dmcaTaskData),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        const result = JSON.parse(response.responseText);
                        this.logMessage(`✓ DMCA задача создана: ${result.data.gid}`, 'success');
                    } else {
                        this.logMessage(`⚠️ DMCA задача не создана: ${response.status}`, 'error');
                    }
                },
                onerror: () => {
                    this.logMessage('❌ Network error для DMCA задачи', 'error');
                }
            });
        }

        // ===== ЛОГИКА ПЕРЕРАСПРЕДЕЛЕНИЯ ПРИОРИТЕТОВ =====

        getPriorityWeight(priority) {
            // FIX v4.1.2: null/undefined = low (вес 1), пустое окно = 0
            if (!priority) return 1; // null автоматически = low
            const weights = { high: 3, medium: 2, low: 1 };
            return weights[priority] || 1;
        }

        // Получить задачи assignee на конкретную дату
        getAssigneeTasksOnDate(assigneeGid, date) {
            return new Promise((resolve, reject) => {
                // v4.3.7: Используем user_task_list для получения только личных задач
                // Сначала получаем user_task_list_gid, потом задачи из него
                const userTaskListUrl = `https://app.asana.com/api/1.0/users/${assigneeGid}/user_task_list?workspace=${CONFIG.asana.workspaceGid}`;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: userTaskListUrl,
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            const userTaskList = JSON.parse(response.responseText).data;
                            if (!userTaskList || !userTaskList.gid) {
                                if(DEBUG) console.log('❌ Не удалось получить user_task_list');
                                resolve([]);
                                return;
                            }

                            // Теперь получаем задачи из user_task_list на конкретную дату
                            const tasksUrl = `https://app.asana.com/api/1.0/user_task_lists/${userTaskList.gid}/tasks?opt_fields=gid,name,due_on,assignee.gid,custom_fields,completed&completed_since=now`;

                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: tasksUrl,
                                headers: {
                                    'Authorization': `Bearer ${CONFIG.asana.token}`
                                },
                                onload: (resp) => {
                                    if (resp.status === 200) {
                                        const result = JSON.parse(resp.responseText);
                                        // Фильтруем только задачи на нужную дату и не завершённые
                                        const tasks = result.data
                                            .filter(task => task.due_on === date && !task.completed)
                                            .map(task => {
                                                let priority = 'low';
                                                if (task.custom_fields) {
                                                    const priorityField = task.custom_fields.find(f => f.gid === CONFIG.asana.customFields.priority.fieldGid);
                                                    if (priorityField && priorityField.enum_value) {
                                                        const optionGid = priorityField.enum_value.gid;
                                                        for (const [key, gid] of Object.entries(CONFIG.asana.customFields.priority.options)) {
                                                            if (gid === optionGid) {
                                                                priority = key;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                                return { ...task, priority };
                                            });
                                        if(DEBUG) console.log(`📊 Мои задачи на ${date}:`, tasks.length, tasks.map(t => t.name));
                                        resolve(tasks);
                                    } else {
                                        resolve([]);
                                    }
                                },
                                onerror: () => resolve([])
                            });
                        } else {
                            resolve([]);
                        }
                    },
                    onerror: () => resolve([])
                });
            });
        }

        // Перенести задачу на новую дату
        updateTaskDueDate(taskGid, newDate) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'PUT',
                    url: `https://app.asana.com/api/1.0/tasks/${taskGid}`,
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({ data: { due_on: newDate } }),
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText).data);
                        } else {
                            reject(new Error(`Failed to update task: ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error'))
                });
            });
        }

        // Найти следующий рабочий день
        getNextWorkDay(dateStr) {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);

            // Пропускаем выходные (0 = воскресенье, 6 = суббота)
            while (date.getDay() === 0 || date.getDay() === 6) {
                date.setDate(date.getDate() + 1);
            }

            return date.toISOString().split('T')[0];
        }

        // Рекурсивный перенос задачи с учётом приоритетов
        // v4.3.7: Добавлен лимит итераций для предотвращения ухода задач далеко
        async relocateTaskRecursively(taskGid, taskPriority, targetDate, assigneeGid, iteration = 0) {
            // v4.3.7: Для low лимит 3 дня, для остальных 10 дней
            const maxIterations = taskPriority === 'low' ? 3 : 10;

            if (iteration >= maxIterations) {
                this.logMessage(`   ⚠️ Лимит переноса (${maxIterations}), ставлю на ${targetDate}`);
                if (taskGid) {
                    await this.updateTaskDueDate(taskGid, targetDate);
                }
                return;
            }

            const existingTasks = await this.getAssigneeTasksOnDate(assigneeGid, targetDate);
            const taskWeight = this.getPriorityWeight(taskPriority);

            // Ищем задачу с меньшим приоритетом на целевую дату
            const lowerPriorityTask = existingTasks.find(t =>
                this.getPriorityWeight(t.priority) < taskWeight && t.gid !== taskGid
            );

            if (lowerPriorityTask) {
                // Рекурсивно переносим найденную задачу
                const nextDate = this.getNextWorkDay(targetDate);
                this.logMessage(`   ↪️ Переношу "${lowerPriorityTask.name}" (${lowerPriorityTask.priority}) на ${nextDate}`);
                await this.relocateTaskRecursively(lowerPriorityTask.gid, lowerPriorityTask.priority, nextDate, assigneeGid, iteration + 1);
                await this.updateTaskDueDate(lowerPriorityTask.gid, nextDate);
            }

            // Если переносим существующую задачу (не новую)
            if (taskGid) {
                await this.updateTaskDueDate(taskGid, targetDate);
            }
        }

        // Основная функция: определить дату с учётом приоритетов
        async calculateDueDateWithPrioritySwap(priority, assigneeGid) {
            const baseDate = this.calculateDueDate();

            if (!assigneeGid) {
                return baseDate;
            }

            this.logMessage(`🔄 Проверяю задачи на ${baseDate}...`);

            // v4.3.7: Разная логика для каждого приоритета
            if (priority === 'high') {
                // HIGH: всегда на сегодня, swap другого high если есть
                return await this.placeHighPriorityTask(assigneeGid, baseDate);
            }

            if (priority === 'medium') {
                // MEDIUM: ищет свободный слот в 4 днях, может вытеснить low
                return await this.placeMediumPriorityTask(assigneeGid, baseDate, 4);
            }

            // LOW: анализ 4 дней, выбор наименее загруженного
            return await this.findLeastLoadedDay(assigneeGid, baseDate, 4);
        }

        // v4.3.7: HIGH — на сегодня если нет другого high, иначе ищет слот
        async placeHighPriorityTask(assigneeGid, baseDate) {
            return await this.findSlotForPriority('high', assigneeGid, baseDate, 4);
        }

        // v4.3.7: MEDIUM — ищет свободный слот в N дней, может вытеснить low
        async placeMediumPriorityTask(assigneeGid, startDate, daysToCheck) {
            return await this.findSlotForPriority('medium', assigneeGid, startDate, daysToCheck);
        }

        // v4.3.7: Универсальный поиск слота с учётом приоритетов
        async findSlotForPriority(priority, assigneeGid, startDate, daysToCheck) {
            const newWeight = this.getPriorityWeight(priority);
            let checkDate = startDate;

            this.logMessage(`📊 Ищу слот для ${priority} в ${daysToCheck} днях...`);

            for (let i = 0; i < daysToCheck; i++) {
                const tasks = await this.getAssigneeTasksOnDate(assigneeGid, checkDate);

                // День свободен — отлично
                if (tasks.length === 0) {
                    this.logMessage(`   ✓ ${checkDate} свободен`);
                    return checkDate;
                }

                // Проверяем приоритеты существующих задач
                const maxExistingWeight = Math.max(...tasks.map(t => this.getPriorityWeight(t.priority)));

                // Если новый приоритет ВЫШЕ всех существующих — swap самого низкого
                if (newWeight > maxExistingWeight) {
                    const lowestTask = tasks.reduce((lowest, t) => {
                        const w = this.getPriorityWeight(t.priority);
                        return (!lowest || w < this.getPriorityWeight(lowest.priority)) ? t : lowest;
                    }, null);

                    if (lowestTask) {
                        const nextDate = this.getNextWorkDay(checkDate);
                        this.logMessage(`   🔀 Вытесняю "${lowestTask.name}" (${lowestTask.priority || 'low'}) → ${nextDate}`);
                        await this.relocateTaskRecursively(lowestTask.gid, lowestTask.priority || 'low', nextDate, assigneeGid, 0);
                        await this.updateTaskDueDate(lowestTask.gid, nextDate);
                    }

                    this.logMessage(`   ✓ ${priority} задача → ${checkDate}`);
                    return checkDate;
                }

                // Приоритеты равны или ниже — смотрим следующий день
                const priorities = tasks.map(t => t.priority || 'low').join(', ');
                this.logMessage(`   ${checkDate}: занят (${priorities}), ищу дальше...`);
                checkDate = this.getNextWorkDay(checkDate);
            }

            // Лимит достигнут — ставим на первый день
            this.logMessage(`   ⚠️ Лимит ${daysToCheck} дней, ставлю на ${startDate}`);
            return startDate;
        }

        // v4.3.7: Найти наименее загруженный день из N дней (для low)
        async findLeastLoadedDay(assigneeGid, startDate, daysToCheck) {
            const daysLoad = [];
            let checkDate = startDate;

            this.logMessage(`📊 Анализирую загруженность на ${daysToCheck} дня...`);

            for (let i = 0; i < daysToCheck; i++) {
                const tasks = await this.getAssigneeTasksOnDate(assigneeGid, checkDate);

                // Рассчитываем вес загруженности: high=3, medium=2, low=1
                let loadWeight = 0;
                tasks.forEach(t => {
                    const w = this.getPriorityWeight(t.priority || 'low');
                    loadWeight += w;
                });

                daysLoad.push({
                    date: checkDate,
                    tasksCount: tasks.length,
                    loadWeight: loadWeight
                });

                this.logMessage(`   ${checkDate}: ${tasks.length} задач (вес: ${loadWeight})`);

                // Если день свободен - сразу берём его
                if (tasks.length === 0) {
                    this.logMessage(`   ✓ Выбран ${checkDate} (свободен)`);
                    return checkDate;
                }

                checkDate = this.getNextWorkDay(checkDate);
            }

            // Выбираем день с минимальным весом загруженности
            daysLoad.sort((a, b) => a.loadWeight - b.loadWeight);
            const bestDay = daysLoad[0];

            this.logMessage(`   ✓ Выбран ${bestDay.date} (${bestDay.tasksCount} задач, вес: ${bestDay.loadWeight})`);
            return bestDay.date;
        }

        // Рекурсивный поиск подходящей даты (для вытесненных задач)
        async findDateForTask(priority, assigneeGid, checkDate, iteration, baseDate) {
            // Ограничиваем поиск до 10 рабочих дней для вытесненных
            const maxIterations = 10;

            // При достижении лимита возвращаем текущую дату
            if (iteration >= maxIterations) {
                this.logMessage(`   ⚠️ Лимит поиска (${maxIterations} дней), ставлю на ${checkDate}`);
                return checkDate;
            }

            const newPriorityWeight = this.getPriorityWeight(priority);
            const existingTasks = await this.getAssigneeTasksOnDate(assigneeGid, checkDate);

            // Дата свободна — ставим сюда
            if (existingTasks.length === 0) {
                this.logMessage(`   ✓ Дата ${checkDate} свободна`);
                return checkDate;
            }

            // Для high/medium: ищем задачу с МЕНЬШИМ приоритетом для свапа
            const lowerPriorityTask = existingTasks.find(t =>
                this.getPriorityWeight(t.priority) < newPriorityWeight
            );

            if (lowerPriorityTask) {
                // Нашли задачу ниже уровнем — делаем свап
                const nextDate = this.getNextWorkDay(checkDate);
                this.logMessage(`   🔀 Свап: "${lowerPriorityTask.name}" (${lowerPriorityTask.priority || 'low'}) → ${nextDate}`);

                // Рекурсивно переносим вытесняемую задачу
                await this.relocateTaskRecursively(lowerPriorityTask.gid, lowerPriorityTask.priority || 'low', nextDate, assigneeGid, 0);
                await this.updateTaskDueDate(lowerPriorityTask.gid, nextDate);

                this.logMessage(`   ✓ Новая ${priority} задача → ${checkDate}`);
                return checkDate;
            }

            // Все задачи >= по приоритету — идём на следующий день
            this.logMessage(`   ℹ️ На ${checkDate} задачи с приоритетом >= ${priority}, ищу дальше...`);
            const nextDate = this.getNextWorkDay(checkDate);
            return await this.findDateForTask(priority, assigneeGid, nextDate, iteration + 1, checkDate);
        }

        selectAssignee(cms, department) {
            return '1212671934125653'; // Timur_Head_Automation
        }

        calculateDueDate() {
            // Все задачи по умолчанию на сегодня
            const today = new Date();
            // Пропускаем выходные
            while (today.getDay() === 0 || today.getDay() === 6) {
                today.setDate(today.getDate() + 1);
            }
            return today.toISOString().split('T')[0];
        }

        sendRocketChatNotification(data, taskData) {
            return new Promise((resolve, reject) => {
                const mention = CONFIG.rocketChat.channels[data.department] || '@Timur_Head_Automation';
                const taskUrl = `https://app.asana.com/0/${CONFIG.asana.projects[data.department]}/${taskData.gid}`;

                // Получаем маппинг и собираем упоминания ответственных из подзадач
                const mapping = loadRocketChatMapping();
                const mentions = new Set([mention]); // Начинаем с mention отдела

                // Добавляем ответственных из подзадач
                if (this.subtasks && this.subtasks.length > 0) {
                    this.subtasks.forEach(subtask => {
                        if (subtask.assignee && mapping[subtask.assignee]) {
                            mentions.add(mapping[subtask.assignee]);
                        }
                    });
                }

                // Формируем строку с упоминаниями
                const mentionsText = Array.from(mentions).join(' ');

                // channel переопределяет дефолтный канал из настроек вебхука
                const message = {
                    channel: mention,
                    text: `🔥 СРОЧНАЯ ЗАДАЧА (High Priority)

${mentionsText}

Задача: ${taskData.name}
ID: ${taskData.gid}
Ссылка: ${taskUrl}
Домен: ${data.domain}
Поддомен: ${data.oldSub} → ${data.newSub}
Отдел: ${data.department}
Приоритет: Выполнить сегодня

Задача создана в Asana и требует немедленного выполнения.`
                };

                this.logMessage(`📤 Отправка в Rocket.Chat → ${mentionsText}`);

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: CONFIG.rocketChat.webhookUrl,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(message),
                    onload: (response) => {
                        this.logMessage(`📡 Ответ Rocket.Chat: ${response.status}`);

                        if (response.status >= 200 && response.status < 300) {
                            this.logMessage(`Ответ: ${response.responseText}`, 'success');
                            resolve();
                        } else {
                            this.logMessage(`Ошибка: ${response.responseText}`, 'error');
                            reject(new Error(`Rocket.Chat webhook error: ${response.status}`));
                        }
                    },
                    onerror: () => {
                        this.logMessage('❌ Network error при отправке в Rocket.Chat', 'error');
                        reject(new Error('Network error при отправке в Rocket.Chat'));
                    }
                });
            });
        }

        makeDraggable() {
            const container = this.shadowRoot.querySelector('.dashboard-container');
            const header = this.shadowRoot.getElementById('dashboard-header');

            header.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.initialX = e.clientX - container.offsetLeft;
                this.initialY = e.clientY - container.offsetTop;
            });

            document.addEventListener('mousemove', (e) => {
                if (this.isDragging) {
                    e.preventDefault();
                    this.currentX = e.clientX - this.initialX;
                    this.currentY = e.clientY - this.initialY;
                    container.style.left = this.currentX + 'px';
                    container.style.top = this.currentY + 'px';
                    container.style.right = 'auto';
                }
            });

            document.addEventListener('mouseup', () => {
                this.isDragging = false;
            });
        }

        destroy() {
            if (this.shadowHost) {
                this.shadowHost.remove();
            }
        }

        hide() {
            if (this.shadowHost) {
                this.shadowHost.style.display = 'none';
            }
        }

        show() {
            if (this.shadowHost) {
                this.shadowHost.style.display = 'block';
            }
        }

        toggle() {
            if (this.shadowHost) {
                if (this.shadowHost.style.display === 'none') {
                    this.show();
                } else {
                    this.hide();
                }
            }
        }

        // ===== МЕТОДЫ ДЛЯ РАБОТЫ С ПОДЗАДАЧАМИ =====

        openSettingsModal() {
            console.log('🔧 openSettingsModal вызван');
            const modal = new UnifiedSettingsModal(this.shadowRoot, () => {
                // После сохранения обновляем селекты
                this.updateDepartmentSelects();
                this.updateCmsSelects();
            });
            console.log('🔧 modal создан:', modal);
            modal.show();
            console.log('🔧 modal.show() вызван');
        }

        updateDepartmentSelects() {
            const depts = getDepartmentsList();
            const options = '<option value="">—</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');

            // Обновляем селект в одиночном режиме
            const singleSelect = this.shadowRoot.getElementById('department');
            if (singleSelect) {
                const currentVal = singleSelect.value;
                singleSelect.innerHTML = options;
                singleSelect.value = currentVal;
            }

            // Перерисовываем таблицу в массовом режиме
            if (this.currentMode === 'mass') {
                this.renderTasksTable();
            }
        }

        updateCmsSelects() {
            const cmsList = getCmsList();
            const options = '<option value="">—</option>' + cmsList.map(c => `<option value="${c.key}">${c.name}</option>`).join('');

            // Обновляем селект в одиночном режиме
            const singleSelect = this.shadowRoot.getElementById('cms');
            if (singleSelect) {
                const currentVal = singleSelect.value;
                singleSelect.innerHTML = options;
                singleSelect.value = currentVal;
            }

            // Перерисовываем таблицу в массовом режиме
            if (this.currentMode === 'mass') {
                this.renderTasksTable();
            }
        }

        // v4.5.1: Модальное окно истории с 3 вкладками
        openAutomationHistoryModal(initialTab = 'local') {
            const automationHistory = loadAutomationHistory();
            const localHistory = loadLocalTzHistory();
            const cloudHistory = loadCloudTzHistory();

            const modalHtml = `
                <div class="automation-history-modal">
                    <style>
                        .automation-history-modal {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0,0,0,0.6);
                            z-index: 10000010;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .ah-content {
                            background: white;
                            border-radius: 12px;
                            width: 95%;
                            max-width: 1500px;
                            max-height: 90vh;
                            display: flex;
                            flex-direction: column;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            position: relative;
                            z-index: 10000011;
                        }
                        .ah-header {
                            padding: 16px 24px;
                            border-bottom: 1px solid #e0e0e0;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            background: linear-gradient(135deg, #4CAF50, #45a049);
                            color: white;
                            border-radius: 12px 12px 0 0;
                            position: relative;
                            z-index: 10000012;
                        }
                        .ah-header h2 {
                            margin: 0;
                            font-size: 20px;
                        }
                        .ah-close {
                            background: rgba(255,255,255,0.2);
                            border: none;
                            color: white;
                            font-size: 24px;
                            cursor: pointer;
                            width: 36px;
                            height: 36px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            pointer-events: auto;
                            position: relative;
                            z-index: 10000013;
                        }
                        .ah-close:hover { background: rgba(255,255,255,0.3); }

                        /* Вкладки */
                        .ah-tabs {
                            display: flex;
                            background: #f5f5f5;
                            border-bottom: 1px solid #e0e0e0;
                        }
                        .ah-tab {
                            flex: 1;
                            padding: 14px 20px;
                            border: none;
                            background: #fff;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            color: #333;
                            transition: all 0.2s;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            border-bottom: 3px solid transparent;
                        }
                        .ah-tab:hover { background: #f0f0f0; }
                        .ah-tab.active {
                            background: white;
                            color: #4CAF50;
                            border-bottom-color: #4CAF50;
                        }
                        .ah-tab-count {
                            background: #e0e0e0;
                            color: #333;
                            padding: 2px 8px;
                            border-radius: 10px;
                            font-size: 12px;
                        }
                        .ah-tab.active .ah-tab-count {
                            background: #e8f5e9;
                            color: #2e7d32;
                        }

                        .ah-tab-panel {
                            display: none;
                            flex-direction: column;
                            flex: 1;
                            overflow: hidden;
                        }
                        .ah-tab-panel.active {
                            display: flex;
                        }

                        .ah-toolbar {
                            padding: 12px 24px;
                            border-bottom: 1px solid #e0e0e0;
                            display: flex;
                            gap: 12px;
                            align-items: center;
                            flex-wrap: wrap;
                            background: white;
                        }
                        .ah-toolbar input, .ah-toolbar select {
                            padding: 8px 12px;
                            border: 1px solid #ddd !important;
                            border-radius: 6px;
                            font-size: 14px;
                            color: #333 !important;
                            background: #fff !important;
                        }
                        .ah-toolbar input { width: 200px; }
                        .ah-stats {
                            margin-left: auto;
                            font-size: 14px;
                            color: #333;
                        }
                        .ah-stats span {
                            background: #e8f5e9;
                            padding: 4px 10px;
                            border-radius: 12px;
                            margin-left: 8px;
                            font-weight: 600;
                            color: #2e7d32;
                        }
                        .ah-body {
                            flex: 1;
                            overflow: auto;
                            padding: 0;
                            background: #f9f9f9;
                        }
                        .ah-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 13px;
                            color: #333;
                        }
                        .ah-table th {
                            background: #f5f5f5;
                            padding: 12px 8px;
                            text-align: left;
                            font-weight: 600;
                            color: #333;
                            border-bottom: 2px solid #e0e0e0;
                            position: sticky;
                            top: 0;
                            z-index: 1;
                            white-space: nowrap;
                        }
                        .ah-table td {
                            padding: 10px 8px;
                            border-bottom: 1px solid #eee;
                            background: white;
                            color: #333;
                            max-width: 150px;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                        }
                        .ah-table tr:hover td { background: #f5f5f5; }
                        .ah-table a { color: #1976d2; text-decoration: none; }
                        .ah-table a:hover { text-decoration: underline; }
                        .status-success { color: #2e7d32; font-weight: 600; }
                        .status-failed { color: #c62828; font-weight: 600; }
                        .mode-single { color: #1565c0; }
                        .mode-mass { color: #7b1fa2; }
                        .ah-redirect-badge {
                            display: inline-block;
                            padding: 2px 6px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                            margin-right: 4px;
                        }
                        .ah-redirect-301 { background: #fff3e0; color: #e65100; }
                        .ah-redirect-404 { background: #ffebee; color: #c62828; }
                        .ah-empty {
                            padding: 60px;
                            text-align: center;
                            color: #999;
                        }
                        .ah-empty-icon { font-size: 48px; margin-bottom: 16px; }
                        .ah-footer {
                            padding: 16px 24px;
                            border-top: 1px solid #e0e0e0;
                            display: flex;
                            gap: 12px;
                            justify-content: flex-end;
                            background: #fafafa;
                            border-radius: 0 0 12px 12px;
                        }
                        .ah-btn {
                            padding: 10px 20px;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            transition: all 0.2s;
                        }
                        .ah-btn-primary { background: #4CAF50; color: white; }
                        .ah-btn-primary:hover { background: #43a047; }
                        .ah-btn-secondary { background: #e0e0e0; color: #333; }
                        .ah-btn-secondary:hover { background: #d0d0d0; }
                        .ah-btn-danger { background: #ffebee; color: #c62828; }
                        .ah-btn-danger:hover { background: #ffcdd2; }
                        .ah-subtasks-btn {
                            background: #e3f2fd;
                            color: #1565c0;
                            padding: 2px 8px;
                            border-radius: 10px;
                            cursor: pointer;
                            font-weight: 600;
                            transition: background 0.2s;
                        }
                        .ah-subtasks-btn:hover { background: #bbdefb; }
                    </style>
                    <div class="ah-content">
                        <div class="ah-header">
                            <h2>📋 История</h2>
                            <button class="ah-close" id="ah-close">×</button>
                        </div>

                        <div class="ah-tabs">
                            <button class="ah-tab ${initialTab === 'local' ? 'active' : ''}" data-tab="local">
                                📄 Локальные ТЗ
                                <span class="ah-tab-count">${localHistory.length}</span>
                            </button>
                            <button class="ah-tab ${initialTab === 'cloud' ? 'active' : ''}" data-tab="cloud">
                                ☁️ Облачные ТЗ
                                <span class="ah-tab-count">${cloudHistory.length}</span>
                            </button>
                        </div>

                        <!-- Вкладка: Локальные ТЗ -->
                        <div class="ah-tab-panel ${initialTab === 'local' ? 'active' : ''}" data-panel="local">
                            <div class="ah-toolbar">
                                <input type="text" id="ah-search-local" placeholder="🔍 Поиск...">
                                <select id="ah-filter-dept-local">
                                    <option value="">Все отделы</option>
                                    ${getDepartmentsList().map(d => '<option value="' + d + '">' + d + '</option>').join('')}
                                </select>
                                <div class="ah-stats">Записей: <span id="ah-total-local">${localHistory.length}</span></div>
                            </div>
                            <div class="ah-body">
                                ${localHistory.length === 0 ? '<div class="ah-empty"><div class="ah-empty-icon">📭</div><div>История локальных ТЗ пуста</div></div>' : ''}
                                <table class="ah-table" id="ah-table-local" style="${localHistory.length === 0 ? 'display:none' : ''}">
                                    <thead>
                                        <tr>
                                            <th>Дата</th>
                                            <th>Задача</th>
                                            <th>Домен</th>
                                            <th>Старый</th>
                                            <th>Новый</th>
                                            <th>Подмена</th>
                                            <th>Отдел</th>
                                            <th>Редирект</th>
                                            <th>Приоритет</th>
                                            <th>CMS</th>
                                            <th>DMCA</th>
                                            <th>AMP</th>
                                            <th>Подзад.</th>
                                            <th>Файл</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ah-tbody-local">
                                        ${localHistory.map(h => this.renderHistoryRow(h, 'local')).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div class="ah-footer">
                                <button class="ah-btn ah-btn-danger" id="ah-clear-local">🗑️ Очистить</button>
                                <button class="ah-btn ah-btn-secondary" id="ah-export-local">📥 Экспорт</button>
                            </div>
                        </div>

                        <!-- Вкладка: Облачные ТЗ -->
                        <div class="ah-tab-panel ${initialTab === 'cloud' ? 'active' : ''}" data-panel="cloud">
                            <div class="ah-toolbar">
                                <input type="text" id="ah-search-cloud" placeholder="🔍 Поиск...">
                                <select id="ah-filter-dept-cloud">
                                    <option value="">Все отделы</option>
                                    ${getDepartmentsList().map(d => '<option value="' + d + '">' + d + '</option>').join('')}
                                </select>
                                <div class="ah-stats">Записей: <span id="ah-total-cloud">${cloudHistory.length}</span></div>
                            </div>
                            <div class="ah-body">
                                ${cloudHistory.length === 0 ? '<div class="ah-empty"><div class="ah-empty-icon">📭</div><div>История облачных ТЗ пуста</div></div>' : ''}
                                <table class="ah-table" id="ah-table-cloud" style="${cloudHistory.length === 0 ? 'display:none' : ''}">
                                    <thead>
                                        <tr>
                                            <th>Дата</th>
                                            <th>Задача</th>
                                            <th>Домен</th>
                                            <th>Старый</th>
                                            <th>Новый</th>
                                            <th>Подмена</th>
                                            <th>Отдел</th>
                                            <th>Редирект</th>
                                            <th>Приоритет</th>
                                            <th>CMS</th>
                                            <th>DMCA</th>
                                            <th>AMP</th>
                                            <th>Подзад.</th>
                                            <th>Таблица</th>
                                            <th>Ссылка</th>
                                        </tr>
                                    </thead>
                                    <tbody id="ah-tbody-cloud">
                                        ${cloudHistory.map(h => this.renderHistoryRow(h, 'cloud')).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div class="ah-footer">
                                <button class="ah-btn ah-btn-danger" id="ah-clear-cloud">🗑️ Очистить</button>
                                <button class="ah-btn ah-btn-secondary" id="ah-export-cloud">📥 Экспорт</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const container = document.createElement('div');
            container.innerHTML = modalHtml;
            const modal = container.firstElementChild;
            document.body.appendChild(modal);

            const closeModal = () => modal.remove();

            // Закрытие
            modal.querySelector('#ah-close').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            // Переключение вкладок
            modal.querySelectorAll('.ah-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    modal.querySelectorAll('.ah-tab').forEach(t => t.classList.remove('active'));
                    modal.querySelectorAll('.ah-tab-panel').forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    modal.querySelector('[data-panel="' + tab.dataset.tab + '"]').classList.add('active');
                });
            });

            // Фильтрация для каждой вкладки
            const setupFilters = (type, history) => {
                const searchInput = modal.querySelector('#ah-search-' + type);
                const deptFilter = modal.querySelector('#ah-filter-dept-' + type);
                const modeFilter = modal.querySelector('#ah-filter-mode-' + type);
                const tbody = modal.querySelector('#ah-tbody-' + type);
                const totalSpan = modal.querySelector('#ah-total-' + type);

                const applyFilters = () => {
                    const search = searchInput?.value.toLowerCase() || '';
                    const dept = deptFilter?.value || '';
                    const mode = modeFilter?.value || '';

                    let visible = 0;
                    tbody.querySelectorAll('tr').forEach(row => {
                        const text = row.textContent.toLowerCase();
                        const rowDept = row.dataset.dept || '';
                        const rowMode = row.dataset.mode || '';

                        const matchSearch = !search || text.includes(search);
                        const matchDept = !dept || rowDept === dept;
                        const matchMode = !mode || rowMode === mode;

                        if (matchSearch && matchDept && matchMode) {
                            row.style.display = '';
                            visible++;
                        } else {
                            row.style.display = 'none';
                        }
                    });
                    if (totalSpan) totalSpan.textContent = visible;
                };

                if (searchInput) searchInput.addEventListener('input', applyFilters);
                if (deptFilter) deptFilter.addEventListener('change', applyFilters);
                if (modeFilter) modeFilter.addEventListener('change', applyFilters);
            };

            setupFilters('local', localHistory);
            setupFilters('cloud', cloudHistory);

            // Подзадачи
            modal.querySelectorAll('.ah-subtasks-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    try {
                        const subtasks = JSON.parse(btn.dataset.subtasks || '[]');
                        if (subtasks.length === 0) {
                            showToast('Нет данных о подзадачах');
                            return;
                        }
                        const list = subtasks.map((s, i) => (i + 1) + '. ' + s.name + (s.priority ? ' (' + s.priority + ')' : '')).join('\n');
                        showToast('Подзадачи:\n\n' + list);
                    } catch (err) {
                        showToast('Ошибка чтения подзадач', 'error');
                    }
                });
            });

            // Очистка
            modal.querySelector('#ah-clear-local').addEventListener('click', () => {
                if (confirm('Удалить всю историю локальных ТЗ?')) {
                    clearLocalTzHistory();
                    closeModal();
                    this.openAutomationHistoryModal('local');
                }
            });
            modal.querySelector('#ah-clear-cloud').addEventListener('click', () => {
                if (confirm('Удалить всю историю облачных ТЗ?')) {
                    clearCloudTzHistory();
                    closeModal();
                    this.openAutomationHistoryModal('cloud');
                }
            });

            // Экспорт
            modal.querySelector('#ah-export-local').addEventListener('click', () => this.exportHistoryToXls('local'));
            modal.querySelector('#ah-export-cloud').addEventListener('click', () => this.exportHistoryToXls('cloud'));
        }

        // Рендер строки истории
        renderHistoryRow(h, type) {
            const date = h.date ? new Date(h.date).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}) : '—';
            const subtasksBtn = (h.subtasksCount || 0) > 0
                ? '<span class="ah-subtasks-btn" data-subtasks=\'' + JSON.stringify(h.subtasks || []).replace(/'/g, "&#39;") + '\'>' + h.subtasksCount + '</span>'
                : '0';

            let lastCols = '';
            if (type === 'automation') {
                lastCols = `
                    <td><span class="mode-${h.mode || 'single'}">${h.mode === 'mass' ? 'Масс' : 'Один'}</span></td>
                    <td class="status-${h.status || 'success'}">${h.status === 'success' ? '✓' : '✗'}</td>
                    <td>${h.asanaTaskUrl ? '<a href="' + h.asanaTaskUrl + '" target="_blank">Открыть</a>' : '—'}</td>
                `;
            } else if (type === 'local') {
                lastCols = `<td>${h.fileName || '—'}</td>`;
            } else if (type === 'cloud') {
                lastCols = `
                    <td title="${h.sheetName || ''}">${(h.sheetName || '—').substring(0, 20)}${(h.sheetName || '').length > 20 ? '...' : ''}</td>
                    <td>${h.sheetUrl ? '<a href="' + h.sheetUrl + '" target="_blank">🔗</a>' : '—'}</td>
                `;
            }

            return `
                <tr data-id="${h.id || ''}" data-dept="${h.department || ''}" data-mode="${h.mode || ''}">
                    <td>${date}</td>
                    <td title="${h.taskName || ''}">${h.taskName || '—'}</td>
                    <td><strong>${h.domain || '—'}</strong></td>
                    <td title="${h.oldSub || ''}">${h.oldSub || '—'}</td>
                    <td title="${h.newSub || ''}">${h.newSub || '—'}</td>
                    <td title="${h.alternateDomain || ''}">${h.alternateDomain || '—'}</td>
                    <td>${h.department || '—'}</td>
                    <td>
                        ${h.redirect301 ? '<span class="ah-redirect-badge ah-redirect-301">301</span>' : ''}
                        ${h.redirect404 ? '<span class="ah-redirect-badge ah-redirect-404">404</span>' : ''}
                    </td>
                    <td>${h.priority || '—'}</td>
                    <td>${h.cms || '—'}</td>
                    <td>${h.dmca ? '✓' : '—'}</td>
                    <td>${h.hasAMP ? '✓' : '—'}</td>
                    <td>${subtasksBtn}</td>
                    ${lastCols}
                </tr>
            `;
        }

        // Экспорт истории в XLS
        exportHistoryToXls(type) {
            let history, sheetName, headers, mapRow;

            if (type === 'automation') {
                history = loadAutomationHistory();
                sheetName = 'Asana автоматизация';
                headers = ['Дата', 'Задача', 'Домен', 'Старый', 'Новый', 'Подмена', 'Отдел', '301', '404', 'Приоритет', 'CMS', 'DMCA', 'AMP', 'Подзадачи', 'Режим', 'Статус', 'Asana URL'];
                mapRow = (h) => [
                    h.date ? new Date(h.date).toLocaleString('ru-RU') : '',
                    h.taskName || '', h.domain || '', h.oldSub || '', h.newSub || '', h.alternateDomain || '',
                    h.department || '', h.redirect301 ? 'Да' : 'Нет', h.redirect404 ? 'Да' : 'Нет',
                    h.priority || '', h.cms || '', h.dmca ? 'Да' : 'Нет', h.hasAMP ? 'Да' : 'Нет',
                    h.subtasksCount || 0, h.mode === 'mass' ? 'Массовый' : 'Одиночный',
                    h.status === 'success' ? 'Успешно' : 'Ошибка', h.asanaTaskUrl || ''
                ];
            } else if (type === 'local') {
                history = loadLocalTzHistory();
                sheetName = 'Локальные ТЗ';
                headers = ['Дата', 'Задача', 'Домен', 'Старый', 'Новый', 'Подмена', 'Отдел', '301', '404', 'Приоритет', 'CMS', 'DMCA', 'AMP', 'Подзадачи', 'Файл'];
                mapRow = (h) => [
                    h.date ? new Date(h.date).toLocaleString('ru-RU') : '',
                    h.taskName || '', h.domain || '', h.oldSub || '', h.newSub || '', h.alternateDomain || '',
                    h.department || '', h.redirect301 ? 'Да' : 'Нет', h.redirect404 ? 'Да' : 'Нет',
                    h.priority || '', h.cms || '', h.dmca ? 'Да' : 'Нет', h.hasAMP ? 'Да' : 'Нет',
                    h.subtasksCount || 0, h.fileName || ''
                ];
            } else if (type === 'cloud') {
                history = loadCloudTzHistory();
                sheetName = 'Облачные ТЗ';
                headers = ['Дата', 'Задача', 'Домен', 'Старый', 'Новый', 'Подмена', 'Отдел', '301', '404', 'Приоритет', 'CMS', 'DMCA', 'AMP', 'Подзадачи', 'Таблица', 'URL'];
                mapRow = (h) => [
                    h.date ? new Date(h.date).toLocaleString('ru-RU') : '',
                    h.taskName || '', h.domain || '', h.oldSub || '', h.newSub || '', h.alternateDomain || '',
                    h.department || '', h.redirect301 ? 'Да' : 'Нет', h.redirect404 ? 'Да' : 'Нет',
                    h.priority || '', h.cms || '', h.dmca ? 'Да' : 'Нет', h.hasAMP ? 'Да' : 'Нет',
                    h.subtasksCount || 0, h.sheetName || '', h.sheetUrl || ''
                ];
            }

            if (!history || history.length === 0) {
                showToast('История пуста');
                return;
            }

            const rows = history.map(mapRow);
            const data = [headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName);

            XLSX.writeFile(wb, type + '-history-' + new Date().toISOString().split('T')[0] + '.xlsx');
        }

        // v4.3.3: Модальное окно управления поддоменами домена
        openSubdomainManagerModal(mode = 'oldSub', massTaskId = null) {
            const currentDomain = this.shadowRoot.getElementById('domain').value.trim();

            if (!currentDomain) {
                showToast('Сначала выберите основной домен');
                return;
            }

            const db = loadSitesDatabase();
            const normalized = normalizeDomain(currentDomain);
            let siteKey = null;
            let site = null;

            for (const d in db) {
                if (db[d].status === 'active' && normalizeDomain(d) === normalized) {
                    siteKey = d;
                    site = db[d];
                    break;
                }
            }

            if (!site) {
                showToast(`Домен "${currentDomain}" не найден в базе. Сначала добавьте его через "Управление доменами".`);
                return;
            }

            const oldSubs = site.oldSubdomains || [];
            const currentSub = site.currentSubdomain || '';

            // v4.3.7: Сохраняем taskId для использования при выборе
            const that = this;
            const targetTaskId = massTaskId;

            const modalHtml = `
                <div class="subdomain-manager-modal">
                    <style>
                        .subdomain-manager-modal {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0,0,0,0.5);
                            z-index: 10000002;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        }
                        .sm-content {
                            background: white;
                            border-radius: 12px;
                            width: 600px;
                            max-height: 95vh;
                            display: flex;
                            flex-direction: column;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            position: relative;
                            z-index: 10000003;
                        }
                        .sm-header {
                            padding: 16px 20px;
                            border-bottom: 1px solid #e0e0e0;
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            background: linear-gradient(135deg, #4CAF50, #45a049);
                            color: white;
                            border-radius: 12px 12px 0 0;
                        }
                        .sm-header h3 { margin: 0; font-size: 16px; }
                        .sm-close {
                            background: rgba(255,255,255,0.2);
                            border: none;
                            color: white;
                            font-size: 20px;
                            cursor: pointer;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            pointer-events: auto;
                        }
                        .sm-close:hover { background: rgba(255,255,255,0.3); }
                        .sm-body { padding: 20px; overflow-y: auto; color: #333; position: relative; z-index: 10000004; }
                        .sm-section { margin-bottom: 20px; }
                        .sm-section-title {
                            font-weight: 600;
                            margin-bottom: 12px;
                            color: #333;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        }
                        .sm-section-title span { font-size: 18px; }
                        .sm-input-row {
                            display: flex;
                            gap: 8px;
                            margin-bottom: 12px;
                        }
                        .sm-input {
                            flex: 1;
                            padding: 10px 12px;
                            border: 1px solid #ddd !important;
                            border-radius: 6px;
                            font-size: 14px;
                            color: #333 !important;
                            background: #fff !important;
                        }
                        .sm-input:focus { border-color: #4CAF50; outline: none; }
                        .sm-btn {
                            padding: 10px 16px;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            pointer-events: auto;
                        }
                        .sm-btn-add { background: #4CAF50; color: white; }
                        .sm-btn-add:hover { background: #45a049; }
                        .sm-btn-save { background: #2196F3; color: white; }
                        .sm-btn-save:hover { background: #1976D2; }
                        .sm-list {
                            border: 1px solid #e0e0e0;
                            border-radius: 8px;
                            max-height: 280px;
                            overflow-y: auto;
                            background: #fff;
                        }
                        .sm-list-empty {
                            padding: 20px;
                            text-align: center;
                            color: #999;
                            font-style: italic;
                        }
                        .sm-list-item {
                            display: flex;
                            align-items: center;
                            padding: 10px 12px;
                            border-bottom: 1px solid #f0f0f0;
                            gap: 10px;
                            color: #333;
                        }
                        .sm-list-item:last-child { border-bottom: none; }
                        .sm-list-item:hover { background: #f9f9f9; }
                        .sm-list-url { flex: 1; font-size: 14px; color: #333; }
                        .sm-list-meta {
                            font-size: 12px;
                            color: #666;
                            display: flex;
                            gap: 8px;
                        }
                        .sm-badge {
                            padding: 2px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: 600;
                        }
                        .sm-badge-301 { background: #e8f5e9; color: #2e7d32; }
                        .sm-badge-404 { background: #ffebee; color: #c62828; }
                        .sm-list-delete {
                            background: none;
                            border: none;
                            color: #999;
                            cursor: pointer;
                            font-size: 16px;
                            padding: 4px;
                        }
                        .sm-list-delete:hover { color: #f44336; }
                        .sm-list-use {
                            background: #e3f2fd;
                            border: none;
                            color: #1976d2;
                            cursor: pointer;
                            font-size: 12px;
                            padding: 4px 8px;
                            border-radius: 4px;
                        }
                        .sm-list-use:hover { background: #bbdefb; }
                        .sm-current-value {
                            padding: 12px;
                            background: #f5f5f5;
                            border-radius: 6px;
                            font-size: 14px;
                            color: #333;
                        }
                        .sm-current-empty { color: #999; font-style: italic; }
                        .sm-footer {
                            padding: 16px 20px;
                            border-top: 1px solid #e0e0e0;
                            display: flex;
                            justify-content: flex-end;
                            gap: 10px;
                            position: relative;
                            z-index: 10000004;
                        }
                        .sm-btn-close { background: #e0e0e0; color: #333; cursor: pointer; pointer-events: auto; }
                        .sm-btn-close:hover { background: #bdbdbd; }
                        .sm-select {
                            padding: 6px 10px;
                            border: 1px solid #ddd !important;
                            border-radius: 4px;
                            font-size: 13px;
                            color: #333 !important;
                            background: #fff !important;
                        }
                    </style>
                    <div class="sm-content">
                        <div class="sm-header">
                            <h3>📁 Поддомены: ${siteKey}</h3>
                            <button class="sm-close" id="sm-close">×</button>
                        </div>
                        <div class="sm-body">
                            <!-- Новый поддомен -->
                            <div class="sm-section">
                                <div class="sm-section-title"><span>🆕</span> Новый поддомен (newSub)</div>
                                <div class="sm-input-row">
                                    <input type="text" class="sm-input" id="sm-current-input" value="${currentSub}" placeholder="new.example.com">
                                    <button class="sm-btn sm-btn-save" id="sm-save-current">💾 Сохранить</button>
                                </div>
                                <div style="font-size: 12px; color: #666; margin-top: 4px;">
                                    Этот поддомен будет предлагаться в поле "Старый поддомен" (т.к. его отключаем)
                                </div>
                            </div>

                            <!-- История старых поддоменов -->
                            <div class="sm-section">
                                <div class="sm-section-title"><span>📜</span> История старых поддоменов (oldSub)</div>
                                <div class="sm-input-row">
                                    <input type="text" class="sm-input" id="sm-old-input" placeholder="old.example.com">
                                    <select class="sm-select" id="sm-old-action">
                                        <option value="404">404</option>
                                        <option value="301">301</option>
                                    </select>
                                    <button class="sm-btn sm-btn-add" id="sm-add-old">➕ Добавить</button>
                                </div>
                                <div class="sm-list" id="sm-old-list">
                                    ${oldSubs.length === 0 ?
                                        '<div class="sm-list-empty">История пуста</div>' :
                                        oldSubs.map((s, i) => `
                                            <div class="sm-list-item" data-index="${i}">
                                                <div class="sm-list-url">${s.url}</div>
                                                <div class="sm-list-meta">
                                                    <span class="sm-badge sm-badge-${s.action || '404'}">${s.action || '404'}</span>
                                                    ${s.usedDate ? `<span>${s.usedDate}</span>` : ''}
                                                </div>
                                                <button class="sm-list-use" data-url="${s.url}" data-redirect="${s.action || '404'}">Выбрать</button>
                                                <button class="sm-list-delete" data-index="${i}">🗑️</button>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>
                        </div>
                        <div class="sm-footer">
                            <button class="sm-btn sm-btn-close" id="sm-close-btn">Закрыть</button>
                        </div>
                    </div>
                </div>
            `;

            const container = document.createElement('div');
            container.innerHTML = modalHtml;
            this.shadowRoot.appendChild(container.firstElementChild);

            const modal = this.shadowRoot.querySelector('.subdomain-manager-modal');

            // Закрытие
            const closeModal = () => modal.remove();
            modal.querySelector('#sm-close').addEventListener('click', closeModal);
            modal.querySelector('#sm-close-btn').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

            // v4.3.7: Предотвращаем перехват событий Asana
            modal.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('keydown', e => e.stopPropagation());
                el.addEventListener('keyup', e => e.stopPropagation());
                el.addEventListener('keypress', e => e.stopPropagation());
                el.addEventListener('input', e => e.stopPropagation());
            });

            // v4.3.7: Блокируем всплытие для кнопок
            modal.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('mousedown', e => e.stopPropagation());
                btn.addEventListener('mouseup', e => e.stopPropagation());
            });

            // Сохранить текущий поддомен
            modal.querySelector('#sm-save-current').addEventListener('click', () => {
                const newCurrent = modal.querySelector('#sm-current-input').value.trim();
                const db = loadSitesDatabase();
                if (db[siteKey]) {
                    // v4.5.7: При смене текущего - старый переносится в историю со статусом 404
                    const oldCurrent = db[siteKey].currentSubdomain;
                    if (oldCurrent && oldCurrent !== newCurrent) {
                        if (!db[siteKey].oldSubdomains) db[siteKey].oldSubdomains = [];
                        // Проверяем что ещё нет в истории
                        const exists = db[siteKey].oldSubdomains.find(s => normalizeDomain(s.url) === normalizeDomain(oldCurrent));
                        if (!exists) {
                            db[siteKey].oldSubdomains.unshift({
                                url: oldCurrent,
                                action: '404',
                                usedDate: new Date().toLocaleDateString('ru-RU')
                            });
                        }
                    }
                    
                    db[siteKey].currentSubdomain = newCurrent;
                    saveSitesDatabase(db);
                    showToast('Новый поддомен сохранён!' + (oldCurrent && oldCurrent !== newCurrent ? ' Старый перенесён в историю.' : ''));

                    // Обновляем UI истории
                    const oldSubs = db[siteKey].oldSubdomains || [];
                    const listHtml = oldSubs.length === 0 ?
                        '<div class="sm-list-empty">История пуста</div>' :
                        oldSubs.map((s, i) => `
                            <div class="sm-list-item" data-index="${i}">
                                <div class="sm-list-url">${s.url}</div>
                                <div class="sm-list-meta">
                                    <span class="sm-badge sm-badge-${s.action || '404'}">${s.action || '404'}</span>
                                    ${s.usedDate ? `<span>${s.usedDate}</span>` : ''}
                                </div>
                                <button class="sm-list-delete" data-index="${i}">🗑️</button>
                            </div>
                        `).join('');
                    modal.querySelector('#sm-old-list').innerHTML = listHtml;

                    // v4.3.7: Обновляем поле oldSub (не newSub!) в зависимости от режима
                    if (targetTaskId) {
                        const task = that.tasks.find(t => t.id === targetTaskId);
                        if (task) {
                            task.oldSub = oldCurrent || newCurrent;
                            that.renderTasksTable();
                        }
                    } else {
                        const oldSubInput = that.shadowRoot.getElementById('oldSub');
                        if (oldSubInput && oldCurrent) {
                            oldSubInput.value = oldCurrent;
                        }
                    }
                }
            });

            // Добавить старый поддомен
            modal.querySelector('#sm-add-old').addEventListener('click', () => {
                const url = modal.querySelector('#sm-old-input').value.trim();
                const action = modal.querySelector('#sm-old-action').value;

                if (!url) {
                    showToast('Введите URL поддомена');
                    return;
                }

                const db = loadSitesDatabase();
                if (db[siteKey]) {
                    if (!db[siteKey].oldSubdomains) db[siteKey].oldSubdomains = [];

                    // Проверяем дубликат
                    const exists = db[siteKey].oldSubdomains.find(s => normalizeDomain(s.url) === normalizeDomain(url));
                    if (exists) {
                        showToast('Такой поддомен уже есть в истории');
                        return;
                    }

                    db[siteKey].oldSubdomains.push({
                        url: url,
                        action: action,
                        usedDate: new Date().toISOString().split('T')[0]
                    });
                    saveSitesDatabase(db);

                    // Перезагружаем модалку
                    closeModal();
                    that.openSubdomainManagerModal(mode);
                }
            });

            // Удаление из списка
            modal.querySelectorAll('.sm-list-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    if (confirm('Удалить этот поддомен из истории?')) {
                        const db = loadSitesDatabase();
                        if (db[siteKey] && db[siteKey].oldSubdomains) {
                            db[siteKey].oldSubdomains.splice(index, 1);
                            saveSitesDatabase(db);
                            closeModal();
                            that.openSubdomainManagerModal(mode);
                        }
                    }
                });
            });

            // Выбрать из списка
            modal.querySelectorAll('.sm-list-use').forEach(btn => {
                btn.addEventListener('click', () => {
                    const url = btn.dataset.url;
                    const redirectType = btn.dataset.redirect || '404';
                    if(DEBUG) console.log('sm-list-use clicked:', url, 'redirect:', redirectType, 'targetTaskId:', targetTaskId);

                    // v4.3.7: Если это массовый режим - обновляем задачу в массиве
                    if (targetTaskId) {
                        const task = that.tasks.find(t => t.id === targetTaskId);
                        if(DEBUG) console.log('Массовый режим, задача:', task);
                        if (task) {
                            task.oldSub = url;
                            // v4.3.7: Устанавливаем флаги редиректа
                            task.redirect301 = (redirectType === '301');
                            task.redirect404 = (redirectType === '404');
                            that.renderTasksTable();
                        }
                    } else {
                        // Одиночный режим
                        const oldSubInput = that.shadowRoot.getElementById('oldSub');
                        if(DEBUG) console.log('Одиночный режим, oldSubInput:', oldSubInput);
                        if (oldSubInput) {
                            oldSubInput.value = url;
                        }
                        // v4.3.7: Устанавливаем флаги редиректа
                        const r301 = that.shadowRoot.getElementById('redirect301');
                        const r404 = that.shadowRoot.getElementById('redirect404');
                        if (r301) r301.checked = (redirectType === '301');
                        if (r404) r404.checked = (redirectType === '404');
                    }
                    closeModal();
                });
            });
        }

        openHistoryModal() {
            this.openSitesModal();
        }

        openUnifiedDomainsModal(taskId = null) {
            this.openSitesModal(taskId);
        }

        openSitesModal(taskId = null) {
            const that = this;
            if(DEBUG) console.log('openSitesModal taskId:', taskId);
            const modal = new SitesModal(
                this.shadowRoot,
                // onUpdate callback
                () => {
                    const domain = that.shadowRoot.getElementById('domain')?.value.trim();
                    if (domain) {
                        that.showOldSubHistory();
                        that.autofillFromSite(domain);
                    }
                },
                // v4.5.7: onSelect callback - выбор сайта из базы
                (domain, site) => {
                    if(DEBUG) console.log('onSelect вызван:', domain, 'taskId:', taskId, 'site:', site);
                    
                    // v4.5.9: Если выбрано только одно поле
                    if (site && site._fieldOnly) {
                        const fieldName = site._fieldOnly;
                        const fieldValue = site[fieldName];
                        if(DEBUG) console.log('Выбор отдельного поля:', fieldName, '=', fieldValue);
                        
                        if (taskId) {
                            const task = that.tasks.find(t => t.id === taskId);
                            if (task) {
                                task[fieldName] = fieldValue;
                                that.renderTasksTable();
                            }
                        } else {
                            // Одиночный режим
                            const input = that.shadowRoot.getElementById(fieldName);
                            if (input) input.value = fieldValue;
                        }
                        showToast(`${fieldName}: ${fieldValue.substring(0, 30)}...`);
                        return; // Не закрываем модалку
                    }
                    
                    // v4.5.7: Если массовый режим - обновляем задачу
                    if (taskId) {
                        const task = that.tasks.find(t => t.id === taskId);
                        if(DEBUG) console.log('Найдена задача:', task);
                        if (task) {
                            task.domain = domain;
                            // Автозаполнение из сайта
                            if (site && site.department) task.department = site.department;
                            if (site && site.cms) task.cms = site.cms;
                            if (site && site.hreflangTemplate !== undefined) task.templateIndex = site.hreflangTemplate;
                            // v4.6.17: hasAMP конвертируем в новый формат
                            if (site && site.hasAMP) task.amp = 'both';
                            if (site && site.dmcaDefault) task.dmca = true;
                            // v4.5.9: Новые поля
                            if (site && site.alternateDomain) task.alternateDomain = site.alternateDomain;
                            if (site && site.toUrl) task.toUrl = site.toUrl;
                            if (site && site.oldUrl) task.oldUrl = site.oldUrl;
                            that.renderTasksTable();
                        }
                    } else {
                        // Одиночный режим - заполняем поле домена
                        const domainInput = that.shadowRoot.getElementById('domain');
                        if(DEBUG) console.log('Одиночный режим, domainInput:', domainInput);
                        if (domainInput) {
                            domainInput.value = domain;
                            that.autofillFromSite(domain);
                            that.checkWwwConsistency();
                        }
                    }
                    showToast(`Выбран: ${domain}`);
                }
            );
            modal.show();
        }

        // Автозаполнение полей при выборе домена из базы
        autofillFromSite(domain) {
            const site = getSite(domain);
            if (!site) return;

            // Автозаполнение отдела
            if (site.department) {
                const deptSelect = this.shadowRoot.getElementById('department');
                if (deptSelect) deptSelect.value = site.department;
            }

            // Автозаполнение CMS
            if (site.cms) {
                const cmsSelect = this.shadowRoot.getElementById('cms');
                if (cmsSelect) cmsSelect.value = site.cms;
            }

            // Автозаполнение шаблона hreflang
            if (site.hreflangTemplate) {
                const tplSelect = this.shadowRoot.getElementById('hreflangTemplate');
                if (tplSelect) tplSelect.value = site.hreflangTemplate;
            }

            // Автозаполнение чекбоксов
            if (site.hasAMP) {
                const ampCheck = this.shadowRoot.getElementById('hasAmp');
                if (ampCheck) ampCheck.checked = true;
            }

            if (site.dmcaDefault) {
                const dmcaCheck = this.shadowRoot.getElementById('dmca');
                if (dmcaCheck) dmcaCheck.checked = true;
            }

            // v4.6.0: Автозаполнение новых полей
            if (site.alternateDomain) {
                const altInput = this.shadowRoot.getElementById('alternateDomain');
                if (altInput) altInput.value = site.alternateDomain;
            }
            if (site.toUrl) {
                const toUrlInput = this.shadowRoot.getElementById('toUrl');
                if (toUrlInput) toUrlInput.value = site.toUrl;
            }
            if (site.oldUrl) {
                const oldUrlInput = this.shadowRoot.getElementById('oldUrl');
                if (oldUrlInput) oldUrlInput.value = site.oldUrl;
            }
        }

        addSelectedDomains(domains) {
            domains.forEach(domainData => {
                // Проверяем, нет ли уже такого домена
                const exists = this.selectedDomains.find(d => d.domain === domainData.domain);
                if (!exists) {
                    this.selectedDomains.push(domainData);
                }
            });
            this.renderSelectedDomains();
        }

        removeSelectedDomain(index) {
            this.selectedDomains.splice(index, 1);
            this.renderSelectedDomains();
        }

        clearSelectedDomains() {
            this.selectedDomains = [];
            this.renderSelectedDomains();
        }

        renderSelectedDomains() {
            const container = this.shadowRoot.getElementById('selected-domains-container');
            const listDiv = this.shadowRoot.getElementById('selected-domains-list');

            if (this.selectedDomains.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';
            listDiv.innerHTML = '';

            this.selectedDomains.forEach((domainData, index) => {
                const chip = document.createElement('div');
                chip.className = 'selected-domain-chip';

                const info = document.createElement('div');
                info.className = 'selected-domain-info';

                const number = document.createElement('div');
                number.className = 'selected-domain-number';
                number.textContent = index + 1;

                const name = document.createElement('div');
                name.className = 'selected-domain-name';
                name.textContent = domainData.domain;

                const meta = document.createElement('div');
                meta.className = 'selected-domain-meta';
                meta.textContent = `${domainData.department} • ${domainData.cms}`;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'selected-domain-remove';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', () => this.removeSelectedDomain(index));

                info.appendChild(number);
                info.appendChild(name);
                chip.appendChild(info);
                chip.appendChild(meta);
                chip.appendChild(removeBtn);
                listDiv.appendChild(chip);
            });
        }


        async createMultipleTasksFromSelected() {
            if (this.selectedDomains.length === 0) {
                showToast('Не выбрано ни одного домена!');
                return;
            }

            // Получаем общие данные из формы
            const oldSub = this.shadowRoot.getElementById('oldSub').value.trim();
            const newSub = this.shadowRoot.getElementById('newSub').value.trim();
            const priority = this.shadowRoot.getElementById('priority').value;
            const templateIndex = this.shadowRoot.getElementById('templateSelect').value;

            // Валидация общих полей
            if (!oldSub || !newSub) {
                showToast('Заполните поля "Старый поддомен" и "Новый поддомен" перед созданием задач!');
                return;
            }

            if (!priority) {
                showToast('Выберите приоритет перед созданием задач!');
                return;
            }

            if (templateIndex === '') {
                showToast('Выберите шаблон hreflang перед созданием задач!');
                return;
            }

            this.showStatusLog();
            this.logMessage(`🚀 Массовое создание задач для ${this.selectedDomains.length} доменов...`);

            const results = {
                success: [],
                failed: [],
                taskLinks: []
            };

            // Создаём задачи по очереди
            for (let i = 0; i < this.selectedDomains.length; i++) {
                const domainData = this.selectedDomains[i];

                try {
                    this.logMessage(`\n📋 [${i+1}/${this.selectedDomains.length}] Создание задачи для: ${domainData.domain}`);

                    // Временно заполняем поля для этого домена
                    const domainInput = this.shadowRoot.getElementById('domain');
                    const departmentSelect = this.shadowRoot.getElementById('department');
                    const cmsSelect = this.shadowRoot.getElementById('cms');

                    domainInput.value = domainData.domain;
                    departmentSelect.value = domainData.department;
                    cmsSelect.value = domainData.cms;

                    // Собираем данные
                    const data = this.collectFormData();

                    // Проверяем подключение к Asana
                    await this.validateAsanaConnection();

                    addToHistory(data.domain, data.oldSub);

                    // FIX v4.1.8: Автообновление базы сайтов
                    updateSiteAfterTask(data.domain, {
                        department: data.department,
                        cms: data.cms,
                        hasAMP: data.amp,
                        dmcaDefault: data.dmca,
                        currentSubdomain: data.newSub,
                        lastTaskDate: new Date().toISOString().split('T')[0],
                        // v4.6.17: Добавлено сохранение oldSub
                        oldSubdomain: data.oldSub,
                        redirect301: data.redirect301,
                        redirect404: data.redirect404,
                        // v4.6.17: Новые поля
                        alternateDomain: data.alternateDomain,
                        toUrl: data.toUrl,
                        oldUrl: data.oldUrl
                    });

                    const tz = this.generateTaskDescription(data);
                    const taskData = await this.createAsanaTask(data, tz);

                    this.logMessage(`✓ Задача создана: ${taskData.name}`, 'success');
                    this.logMessage(`🔗 https://app.asana.com/0/${CONFIG.asana.projects[data.department]}/${taskData.gid}`, 'success');

                    results.success.push(domainData.domain);
                    results.taskLinks.push({
                        domain: domainData.domain,
                        link: `https://app.asana.com/0/${CONFIG.asana.projects[data.department]}/${taskData.gid}`
                    });

                    // Создание подзадач если они есть
                    if (this.subtasks.length > 0) {
                        this.logMessage(`📝 Создание ${this.subtasks.length} подзадач...`);
                        const projectGid = CONFIG.asana.projects[data.department];

                        for (const subtask of this.subtasks) {
                            if (subtask.name.trim()) {
                                try {
                                    await this.createAsanaSubtask(
                                        taskData.gid,
                                        subtask,
                                        projectGid,
                                        CONFIG.asana.workspaceGid
                                    );
                                } catch (error) {
                                    this.logMessage(`   ⚠️ Ошибка создания подзадачи: ${error.message}`, 'error');
                                }
                            }
                        }
                        this.logMessage(`✓ Подзадачи созданы`, 'success');
                    }

                    // Отправка в Rocket.Chat
                    if (data.priority === 'high') {
                        try {
                            this.logMessage('📤 Отправка уведомления в Rocket.Chat...');
                            await this.sendRocketChatNotification(data, taskData);
                            this.logMessage('✓ Уведомление отправлено в Rocket.Chat', 'success');
                        } catch (rocketError) {
                            this.logMessage(`⚠ Ошибка Rocket.Chat: ${rocketError.message}`, 'error');
                        }
                    }

                } catch (error) {
                    console.error(`Ошибка создания задачи для ${domainData.domain}:`, error);
                    this.logMessage(`❌ Ошибка для ${domainData.domain}: ${error.message}`, 'error');
                    results.failed.push(domainData.domain);
                }

                // Задержка между запросами
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Финальный отчёт
            this.logMessage(`\n\n========== ИТОГИ ==========`, 'success');
            this.logMessage(`✅ Успешно создано: ${results.success.length}`, 'success');
            results.taskLinks.forEach(item => {
                this.logMessage(`  • ${item.domain}`, 'success');
                this.logMessage(`    ${item.link}`, 'info');
            });

            if (results.failed.length > 0) {
                this.logMessage(`\n❌ Ошибки: ${results.failed.length}`, 'error');
                results.failed.forEach(d => this.logMessage(`  • ${d}`, 'error'));
            }

            this.logMessage(`\n🎉 Массовое создание завершено!`, 'success');

            // Очищаем список выбранных доменов после успешного создания
            this.clearSelectedDomains();
        }

        openSubtaskTemplatesModal() {
            const modal = new SubtaskTemplatesModal(this.shadowRoot, (selectedTemplates) => {
                // Добавляем выбранные шаблоны как подзадачи
                selectedTemplates.forEach(template => {
                    const subtask = {
                        id: this.subtaskIdCounter++, // Используем счётчик вместо Date.now()
                        name: template.name,
                        assignee: template.assignee || '', // Используем ответственного из шаблона
                        priority: template.priority,
                        allocation: template.allocation
                    };
                    this.subtasks.push(subtask);
                });
                this.renderSubtasks();
            });
            modal.show();
        }

        async loadTeamMembers() {
            // Сначала загружаем из кеша (мгновенно)
            const cache = loadTeamMembersFromCache();
            if (cache.data && cache.data.length > 0) {
                this.teamMembers = cache.data;
                if(DEBUG) console.log('📦 Team members загружены из кеша:', cache.data.length);

                // Если кеш устарел - обновляем в фоне
                if (isTeamMembersCacheExpired()) {
                    if(DEBUG) console.log('⏰ Кеш устарел, запускаем фоновое обновление...');
                    fetchTeamMembersFromAPI().then(members => {
                        this.teamMembers = members;
                    }).catch(err => console.warn('Фоновое обновление не удалось:', err));
                }

                return this.teamMembers;
            }

            // Если кеша нет - загружаем из API
            if(DEBUG) console.log('🌐 Загружаем team members из API...');
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://app.asana.com/api/1.0/workspaces/${CONFIG.asana.workspaceGid}/users`,
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            const result = JSON.parse(response.responseText);
                            this.teamMembers = result.data;
                            saveTeamMembersToCache(result.data);
                            resolve(result.data);
                        } else {
                            reject(new Error('Failed to load team members'));
                        }
                    },
                    onerror: () => reject(new Error('Network error'))
                });
            });
        }

        async addSubtask() {
            // Загружаем список пользователей если ещё не загружен
            if (!this.teamMembers) {
                try {
                    await this.loadTeamMembers();
                } catch (error) {
                    console.error('Failed to load team members:', error);
                }
            }

            const subtask = {
                id: this.subtaskIdCounter++, // Используем счётчик вместо Date.now()
                name: '',
                assignee: '',
                priority: '',      // v4.5.2: пустое по умолчанию
                allocation: null   // v4.5.2: пустое по умолчанию
            };

            this.subtasks.push(subtask);
            this.renderSubtasks();
        }

        removeSubtask(id) {
            this.subtasks = this.subtasks.filter(st => st.id !== id);
            this.renderSubtasks();
        }

        updateSubtask(id, field, value) {
            const subtask = this.subtasks.find(st => st.id === id);
            if (subtask) {
                subtask[field] = value;
            }
        }

        renderSubtasks() {
            const container = this.shadowRoot.getElementById('subtasks-container');

            if (this.subtasks.length === 0) {
                container.innerHTML = '<div style="color: #999; font-size: 13px; padding: 10px;">Подзадачи не добавлены</div>';
                return;
            }

            container.innerHTML = this.subtasks.map((subtask, index) => `
                <div class="subtask-item" data-id="${subtask.id}">
                    <div class="subtask-item-header">
                        <div class="subtask-number">${index + 1}</div>
                        <input
                            type="text"
                            class="subtask-name-input"
                            placeholder="Название подзадачи"
                            value="${subtask.name}"
                            data-field="name"
                        />
                        <button class="subtask-delete-btn" data-action="delete">❌</button>
                    </div>
                    <div class="subtask-fields">
                        <div class="subtask-field subtask-field-full">
                            <label class="subtask-field-label">Ответственный</label>
                            <select class="subtask-select" data-field="assignee">
                                <option value="">Не выбрано</option>
                                ${this.teamMembers ? this.teamMembers.map(member => `
                                    <option value="${member.gid}" ${subtask.assignee === member.gid ? 'selected' : ''}>
                                        ${member.name}
                                    </option>
                                `).join('') : '<option value="">Загрузка...</option>'}
                            </select>
                        </div>
                        <div class="subtask-field">
                            <label class="subtask-field-label">Приоритет</label>
                            <select class="subtask-select" data-field="priority">
                                <option value="" ${!subtask.priority ? 'selected' : ''}>—</option>
                                <option value="high" ${subtask.priority === 'high' ? 'selected' : ''}>High</option>
                                <option value="medium" ${subtask.priority === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="low" ${subtask.priority === 'low' ? 'selected' : ''}>Low</option>
                            </select>
                        </div>
                        <div class="subtask-field">
                            <label class="subtask-field-label">Allocation (%)</label>
                            <input
                                type="number"
                                class="subtask-allocation-input"
                                min="0"
                                max="100"
                                value="${subtask.allocation || ''}"
                                placeholder="—"
                                data-field="allocation"
                            />
                        </div>
                    </div>
                </div>
            `).join('');

            // Добавляем обработчики событий для всех полей
            container.querySelectorAll('.subtask-item').forEach(item => {
                const id = parseInt(item.dataset.id); // Теперь ID целочисленные

                // Обработчики для полей ввода
                item.querySelectorAll('input, select').forEach(field => {
                    const fieldName = field.dataset.field;
                    // Предотвращаем всплытие событий к Asana
                    field.addEventListener('keydown', (e) => e.stopPropagation());
                    field.addEventListener('keyup', (e) => e.stopPropagation());
                    field.addEventListener('keypress', (e) => e.stopPropagation());
                    field.addEventListener('input', (e) => e.stopPropagation());
                    field.addEventListener('focus', (e) => e.stopPropagation());

                    field.addEventListener('change', (e) => {
                        e.stopPropagation();
                        let value = e.target.value;
                        if (fieldName === 'allocation') {
                            value = value ? parseInt(value) : null;  // v4.5.2: может быть пустым
                        }
                        this.updateSubtask(id, fieldName, value);
                    });
                });

                // Обработчик для кнопки удаления
                const deleteBtn = item.querySelector('[data-action="delete"]');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeSubtask(id);
                    });
                }
            });
        }

        createAsanaSubtask(parentTaskGid, subtaskData, projectGid, workspaceGid) {
            return new Promise((resolve, reject) => {
                const priorityOptionGid = CONFIG.asana.customFields.priority.options[subtaskData.priority];
                const percentAllocation = subtaskData.allocation / 100; // Преобразуем проценты в формат Asana

                const taskData = {
                    data: {
                        name: subtaskData.name,
                        parent: parentTaskGid,
                        projects: [projectGid],
                        workspace: workspaceGid,
                        custom_fields: {
                            [CONFIG.asana.customFields.priority.fieldGid]: priorityOptionGid,
                            [CONFIG.asana.customFields.percentAllocation]: percentAllocation
                        }
                    }
                };

                if (subtaskData.assignee) {
                    taskData.data.assignee = subtaskData.assignee;
                }

                this.logMessage(`   📝 Создаю подзадачу: ${subtaskData.name}`);

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: 'https://app.asana.com/api/1.0/tasks',
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(taskData),
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            const result = JSON.parse(response.responseText);
                            this.logMessage(`   ✓ Подзадача создана: ${result.data.gid}`, 'success');
                            resolve(result.data);
                        } else {
                            let errorMsg = `Subtask creation error: ${response.status}`;
                            try {
                                const errorData = JSON.parse(response.responseText);
                                if (errorData.errors && errorData.errors.length > 0) {
                                    errorMsg += ` - ${errorData.errors[0].message}`;
                                }
                            } catch (e) {
                                errorMsg += ` - ${response.responseText}`;
                            }
                            this.logMessage(`   ❌ ${errorMsg}`, 'error');
                            reject(new Error(errorMsg));
                        }
                    },
                    onerror: () => {
                        this.logMessage('   ❌ Network error при создании подзадачи', 'error');
                        reject(new Error('Network error'));
                    }
                });
            });
        }
    }

    // ===== КЛАСС ДЛЯ МОДАЛЬНОГО ОКНА ШАБЛОНОВ =====
    class TemplateModal {
        constructor(parentShadowRoot, onUpdate) {
            this.parentShadowRoot = parentShadowRoot;
            this.onUpdate = onUpdate;
            this.modalHost = null;
            this.shadowRoot = null;
            this.editIndex = null;
        }

        show() {
            this.modalHost = document.createElement('div');
            this.modalHost.id = 'template-modal-shadow-host';
            document.body.appendChild(this.modalHost);

            this.shadowRoot = this.modalHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES;
            this.shadowRoot.appendChild(styleSheet);

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(modal);

            this.renderTemplatesList();
            this.attachEventListeners();
        }

        getHTML() {
            return `
                <div class="modal-content">
                    <h3 class="modal-title">Управление шаблонами hreflang</h3>
                    <div id="templates-list"></div>
                    <hr class="divider" />
                    <h4 style="margin-bottom: 12px; color: #333;">Добавить / Изменить шаблон</h4>
                    <div class="form-group">
                        <label class="form-label">Название шаблона</label>
                        <input type="text" class="form-input" id="template-name" />
                    </div>
                    <div class="form-group">
                        <label class="form-label">Код шаблона (используйте {{newSub}} и {{domain}})</label>
                        <textarea class="textarea" id="template-code"></textarea>
                    </div>
                    <div class="modal-buttons">
                        <button class="btn-save" id="save-template">Сохранить</button>
                        <button class="btn-cancel" id="close-modal">Закрыть</button>
                    </div>
                </div>
            `;
        }

        attachEventListeners() {
            this.shadowRoot.getElementById('close-modal').addEventListener('click', () => this.close());
            this.shadowRoot.getElementById('save-template').addEventListener('click', () => this.saveTemplate());

            // ===== FIX: stopPropagation для полей ввода шаблона =====
            ['template-name', 'template-code'].forEach(id => {
                const el = this.shadowRoot.getElementById(id);
                if (el) {
                    el.addEventListener('keydown', (e) => e.stopPropagation());
                    el.addEventListener('keyup', (e) => e.stopPropagation());
                    el.addEventListener('keypress', (e) => e.stopPropagation());
                    el.addEventListener('input', (e) => e.stopPropagation());
                    el.addEventListener('focus', (e) => e.stopPropagation());
                }
            });
        }

        renderTemplatesList() {
            const listDiv = this.shadowRoot.getElementById('templates-list');
            const templates = loadTemplates();
            listDiv.innerHTML = '';

            templates.forEach((tpl, idx) => {
                const item = document.createElement('div');
                item.className = 'template-item';

                const name = document.createElement('div');
                name.className = 'template-name';
                name.textContent = tpl.name;

                const code = document.createElement('pre');
                code.className = 'template-code';
                code.textContent = tpl.code;

                const actions = document.createElement('div');
                actions.className = 'template-actions';

                const btnEdit = document.createElement('button');
                btnEdit.className = 'btn-edit';
                btnEdit.textContent = 'Изменить';
                btnEdit.onclick = () => {
                    this.shadowRoot.getElementById('template-name').value = tpl.name;
                    this.shadowRoot.getElementById('template-code').value = tpl.code;
                    this.editIndex = idx;
                };

                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn-delete';
                btnDelete.textContent = 'Удалить';
                btnDelete.onclick = () => {
                    if (confirm('Удалить этот шаблон?')) {
                        templates.splice(idx, 1);
                        saveTemplates(templates);
                        this.renderTemplatesList();
                        this.onUpdate();
                    }
                };

                actions.appendChild(btnEdit);
                actions.appendChild(btnDelete);

                item.appendChild(name);
                item.appendChild(code);
                item.appendChild(actions);
                listDiv.appendChild(item);
            });
        }

        saveTemplate() {
            const name = this.shadowRoot.getElementById('template-name').value.trim();
            const code = this.shadowRoot.getElementById('template-code').value.trim();

            if (!name || !code) {
                showToast('Заполните название и код шаблона');
                return;
            }

            let templates = loadTemplates();

            if (this.editIndex !== null) {
                templates[this.editIndex] = { name, code };
            } else {
                templates.push({ name, code });
            }

            saveTemplates(templates);
            this.renderTemplatesList();
            this.onUpdate();

            this.shadowRoot.getElementById('template-name').value = '';
            this.shadowRoot.getElementById('template-code').value = '';
            this.editIndex = null;

            showToast('Шаблон сохранен успешно');
        }

        close() {
            if (this.modalHost) {
                this.modalHost.remove();
            }
        }
    }

    // ===== КЛАСС ДЛЯ МОДАЛЬНОГО ОКНА НАСТРОЕК ROCKET.CHAT =====

    // ===== КЛАСС ДЛЯ ОБЪЕДИНЁННОГО МОДАЛЬНОГО ОКНА ДОМЕНОВ =====

    // ===== КЛАСС ДЛЯ МОДАЛЬНОГО ОКНА ИСТОРИИ ПОДДОМЕНОВ =====

    // ===== КЛАСС ДЛЯ УПРАВЛЕНИЯ ЕДИНОЙ БАЗОЙ САЙТОВ =====
    class SitesModal {
        constructor(parentShadowRoot, onUpdate, onSelect = null) {
            this.parentShadowRoot = parentShadowRoot;
            this.onUpdate = onUpdate;
            this.onSelect = onSelect; // v4.5.7: Callback при выборе сайта
            this.modalHost = null;
            this.shadowRoot = null;
            this.currentTab = 'main';
            this.filterDepartment = '';
            this.searchQuery = '';
            this.editingDomain = null;
        }

        show() {
            this.modalHost = document.createElement('div');
            this.modalHost.id = 'sites-modal-shadow-host';
            document.body.appendChild(this.modalHost);
            this.shadowRoot = this.modalHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES + this.getStyles();
            this.shadowRoot.appendChild(styleSheet);

            const overlay = document.createElement('div');
            overlay.className = 'sites-modal-overlay';
            overlay.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(overlay);

            this.attachEventListeners();
            this.switchTab('main');
        }

        getStyles() {
            return `
                .sites-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000001; }
                .sites-modal-content { background: white; border-radius: 12px; width: 95%; max-width: 1100px; max-height: 85vh; overflow: hidden; display: flex; flex-direction: column; }
                .sites-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: #f8f9fa; }
                .sites-modal-title { margin: 0; font-size: 18px; color: #333; }
                .sites-modal-close { background: none; border: none; font-size: 28px; color: #333; cursor: pointer; padding: 0; width: 32px; height: 32px; line-height: 1; }
                .sites-modal-close:hover { color: #000; }
                .sites-tabs { display: flex; border-bottom: 1px solid #e0e0e0; background: #fafafa; }
                .sites-tab { flex: 1; padding: 12px 16px; border: none; background: none; cursor: pointer; font-size: 14px; color: #666; transition: all 0.2s; }
                .sites-tab:hover { background: #f0f0f0; }
                .sites-tab.active { background: white; color: #4CAF50; border-bottom: 2px solid #4CAF50; margin-bottom: -1px; font-weight: 500; }
                .sites-body { flex: 1; overflow-y: auto; padding: 16px; }
                .sites-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; background: #f0f7f0; padding: 16px; border-radius: 8px; }
                .sites-stat-item { text-align: center; }
                .sites-stat-value { font-size: 24px; font-weight: bold; color: #28a745; }
                .sites-stat-label { font-size: 12px; color: #666; }
                .sites-toolbar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
                .sites-toolbar-btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; color: #333; }
                .sites-toolbar-btn-primary { background: #4CAF50; color: white; }
                .sites-toolbar-btn-secondary { background: #f0f0f0; color: #333; }
                .sites-toolbar-btn:hover { opacity: 0.9; }
                .sites-search { width: 250px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; color: #000; background: #fff; }
                .sites-search::placeholder { color: #888; }
                .sites-filter-select { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; min-width: 150px; color: #333; background: #fff; }
                .sites-table { width: 100%; border-collapse: collapse; font-size: 13px; color: #000; table-layout: fixed; background: #fff; }
                .sites-table th { background: #f8f9fa; padding: 8px 6px; text-align: left; font-weight: 600; border-bottom: 2px solid #dee2e6; color: #333; white-space: nowrap; }
                .sites-table td { padding: 8px 6px; border-bottom: 1px solid #eee; color: #000 !important; overflow: hidden; text-overflow: ellipsis; background: #fff; }
                .sites-table tr:hover { background: #f8f9fa; }
                /* v4.6.17: Адаптивные ширины колонок (11 колонок) */
                .sites-table th:nth-child(1), .sites-table td:nth-child(1) { width: 13%; } /* Домен */
                .sites-table th:nth-child(2), .sites-table td:nth-child(2) { width: 7%; } /* Отдел */
                .sites-table th:nth-child(3), .sites-table td:nth-child(3) { width: 7%; } /* CMS */
                .sites-table th:nth-child(4), .sites-table td:nth-child(4) { width: 8%; } /* hreflang */
                .sites-table th:nth-child(5), .sites-table td:nth-child(5) { width: 10%; } /* Подмена */
                .sites-table th:nth-child(6), .sites-table td:nth-child(6) { width: 10%; } /* URL дропа */
                .sites-table th:nth-child(7), .sites-table td:nth-child(7) { width: 10%; } /* oldURL */
                .sites-table th:nth-child(8), .sites-table td:nth-child(8) { width: 10%; } /* Флаги */
                .sites-table th:nth-child(9), .sites-table td:nth-child(9) { width: 5%; } /* Статус */
                .sites-table th:nth-child(10), .sites-table td:nth-child(10) { width: 8%; } /* Заметки */
                .sites-table th:nth-child(11), .sites-table td:nth-child(11) { width: 12%; } /* Действия */
                .sites-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
                .sites-badge-amp { background: #e3f2fd; color: #1976d2; }
                .sites-badge-dmca { background: #fff3e0; color: #f57c00; }
                .sites-badge-dept { background: #e8f5e9; color: #388e3c; }
                .sites-badge-cms { background: #f3e5f5; color: #7b1fa2; }
                .sites-badge-301 { background: #e8f5e9; color: #2e7d32; }
                .sites-badge-404 { background: #ffebee; color: #c62828; }
                .sites-action-btn { background: none; border: none; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 16px; }
                .sites-action-btn-select { background: #e8f5e9; color: #2e7d32; font-weight: bold; }
                .sites-action-btn-select:hover { background: #c8e6c9; }
                .sites-action-btn:hover { background: #e0e0e0; }
                .sites-cell-text { font-size: 12px; color: #000 !important; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .sites-cell-empty { color: #999 !important; font-size: 12px; }
                .sites-subdomains-count { background: #e0e0e0; padding: 2px 8px; border-radius: 10px; font-size: 12px; color: #333; }
                .sites-empty { text-align: center; padding: 40px; color: #666; }
                .sites-form { background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
                .sites-form-title { margin: 0 0 16px 0; font-size: 16px; color: #333; }
                .sites-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
                .sites-form-group { display: flex; flex-direction: column; gap: 4px; }
                .sites-form-label { font-size: 12px; color: #555; font-weight: 500; }
                .sites-form-input, .sites-form-select { padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; color: #333; background: #fff; }
                .sites-form-checkbox { display: flex; align-items: center; gap: 8px; padding-top: 20px; color: #333; }
                .sites-form-checkbox label { color: #333; cursor: pointer; }
                .sites-form-buttons { display: flex; gap: 8px; margin-top: 16px; }
                .sites-import-dropdown { position: relative; display: inline-block; }
                .sites-import-menu { display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; min-width: 220px; }
                .sites-import-menu.active { display: block; }
                .sites-import-item { padding: 10px 16px; cursor: pointer; color: #333; font-size: 13px; border-bottom: 1px solid #eee; }
                .sites-import-item:last-child { border-bottom: none; }
                .sites-import-item:hover { background: #f5f5f5; }
                .sites-import-item small { display: block; color: #888; font-size: 11px; margin-top: 2px; }
                .sites-tab-content { display: none; }
                .sites-tab-content.active { display: block; }
                .sites-subdomain-cell { max-width: 300px; word-break: break-all; }
                .sites-date-cell { white-space: nowrap; color: #666; font-size: 12px; }
            `;
        }

        getHTML() {
            const stats = getSitesStats();
            const deptOptions = getDepartmentsList().map(d => `<option value="${d}">${d}</option>`).join('');
            const cmsOptions = getCmsList().map(c => `<option value="${c.key}">${c.name}</option>`).join('');
            const templateOptions = Object.entries(loadTemplates()).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');

            return `
                <div class="sites-modal-content">
                    <div class="sites-modal-header">
                        <h3 class="sites-modal-title">🌐 База сайтов</h3>
                        <button class="sites-modal-close" id="close-sites-modal">×</button>
                    </div>

                    <div class="sites-tabs">
                        <button class="sites-tab active" data-tab="main">📋 Основной домен</button>
                        <button class="sites-tab" data-tab="old">📜 Старый поддомен</button>
                        <button class="sites-tab" data-tab="new">🆕 Новый поддомен</button>
                    </div>

                    <div class="sites-body">
                        <div class="sites-stats">
                            <div class="sites-stat-item"><div class="sites-stat-value" id="stat-total">${stats.totalSites}</div><div class="sites-stat-label">Всего сайтов</div></div>
                            <div class="sites-stat-item"><div class="sites-stat-value" id="stat-active">${stats.activeSites}</div><div class="sites-stat-label">Активных</div></div>
                            <div class="sites-stat-item"><div class="sites-stat-value" id="stat-subdomains">${stats.totalSubdomains}</div><div class="sites-stat-label">Поддоменов</div></div>
                            <div class="sites-stat-item"><div class="sites-stat-value" id="stat-avg">${stats.avgSubdomainsPerSite}</div><div class="sites-stat-label">В среднем</div></div>
                        </div>

                        <div class="sites-tab-content active" id="content-main">
                            <div class="sites-toolbar">
                                <button class="sites-toolbar-btn sites-toolbar-btn-primary" id="add-site-btn">➕ Добавить</button>
                                <div class="sites-import-dropdown">
                                    <button class="sites-toolbar-btn sites-toolbar-btn-secondary" id="import-btn">📥 Импорт ▾</button>
                                    <div class="sites-import-menu" id="import-menu">
                                        <div class="sites-import-item" data-mode="merge">➕ Добавить к существующим<small>Новые данные дополнят базу</small></div>
                                        <div class="sites-import-item" data-mode="replace">🔄 Заменить всё<small>Текущая база будет очищена</small></div>
                                    </div>
                                </div>
                                <button class="sites-toolbar-btn sites-toolbar-btn-secondary" id="export-btn">📤 Экспорт</button>
                                <div style="flex:1;"></div>
                                <input type="text" class="sites-search" id="search-main" placeholder="🔍 Поиск домена..." />
                                <select class="sites-filter-select" id="filter-dept-main"><option value="">Все отделы</option>${deptOptions}</select>
                            </div>

                            <div class="sites-form" id="site-form" style="display: none;">
                                <h4 class="sites-form-title" id="form-title">Добавить сайт</h4>
                                <div class="sites-form-grid">
                                    <div class="sites-form-group"><label class="sites-form-label">Домен *</label><input type="text" class="sites-form-input" id="form-domain" placeholder="example.com" /></div>
                                    <div class="sites-form-group"><label class="sites-form-label">Отдел</label><select class="sites-form-select" id="form-department"><option value="">—</option>${deptOptions}</select></div>
                                    <div class="sites-form-group"><label class="sites-form-label">CMS</label><select class="sites-form-select" id="form-cms"><option value="">—</option>${cmsOptions}</select></div>
                                    <div class="sites-form-group"><label class="sites-form-label">Шаблон hreflang</label><select class="sites-form-select" id="form-hreflang"><option value="">—</option>${templateOptions}</select></div>
                                    <div class="sites-form-group sites-form-checkbox"><label><input type="checkbox" id="form-amp" /> AMP</label><label style="margin-left:12px;"><input type="checkbox" id="form-dmca" /> DMCA</label></div>
                                    <div class="sites-form-group"><label class="sites-form-label">Статус</label><select class="sites-form-select" id="form-status"><option value="active">Активный</option><option value="inactive">Неактивный</option></select></div>
                                </div>
                                <!-- v4.5.9: Новые поля -->
                                <div class="sites-form-grid" style="margin-top: 12px;">
                                    <div class="sites-form-group"><label class="sites-form-label">Домен подмены</label><input type="text" class="sites-form-input" id="form-alternate" placeholder="alternate-domain.com" /></div>
                                    <div class="sites-form-group"><label class="sites-form-label">URL дропа (301/404)</label><input type="text" class="sites-form-input" id="form-tourl" placeholder="https://drop.example.com/" /></div>
                                </div>
                                <div class="sites-form-group" style="margin-top: 12px;"><label class="sites-form-label">URL для 404 (по строкам)</label><textarea class="sites-form-input" id="form-oldurl" placeholder="https://site.com/page1/&#10;https://site.com/page2/" rows="2" style="resize: vertical;"></textarea></div>
                                <div class="sites-form-group" style="margin-top: 12px;"><label class="sites-form-label">Заметки</label><input type="text" class="sites-form-input" id="form-notes" placeholder="Опционально" /></div>
                                <div class="sites-form-buttons">
                                    <button class="sites-toolbar-btn sites-toolbar-btn-primary" id="form-save">💾 Сохранить</button>
                                    <button class="sites-toolbar-btn sites-toolbar-btn-secondary" id="form-cancel">Отмена</button>
                                </div>
                            </div>

                            <div id="table-main"></div>
                        </div>

                        <div class="sites-tab-content" id="content-old">
                            <div class="sites-toolbar">
                                <button class="sites-toolbar-btn sites-toolbar-btn-primary" id="add-old-sub-btn">➕ Добавить</button>
                                <input type="text" class="sites-search" id="search-old" placeholder="🔍 Поиск поддомена или домена..." style="width: 350px;" />
                                <select class="sites-filter-select" id="filter-dept-old"><option value="">Все отделы</option>${deptOptions}</select>
                            </div>
                            <div id="table-old"></div>
                        </div>

                        <div class="sites-tab-content" id="content-new">
                            <div class="sites-toolbar">
                                <input type="text" class="sites-search" id="search-new" placeholder="🔍 Поиск..." style="width: 350px;" />
                                <select class="sites-filter-select" id="filter-dept-new"><option value="">Все отделы</option>${deptOptions}</select>
                            </div>
                            <div id="table-new"></div>
                        </div>
                    </div>

                    <input type="file" id="import-file-input" accept=".xlsx,.xls" style="display: none;" />
                </div>
            `;
        }

        attachEventListeners() {
            this.shadowRoot.getElementById('close-sites-modal').addEventListener('click', () => this.close());

            // ===== FIX: stopPropagation для полей формы добавления сайта =====
            ['form-domain', 'form-notes'].forEach(id => {
                const el = this.shadowRoot.getElementById(id);
                if (el) {
                    el.addEventListener('keydown', (e) => e.stopPropagation());
                    el.addEventListener('keyup', (e) => e.stopPropagation());
                    el.addEventListener('keypress', (e) => e.stopPropagation());
                    el.addEventListener('input', (e) => e.stopPropagation());
                    el.addEventListener('focus', (e) => e.stopPropagation());
                }
            });

            this.shadowRoot.querySelectorAll('.sites-tab').forEach(tab => {
                tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
            });

            this.shadowRoot.getElementById('add-site-btn').addEventListener('click', () => this.showForm());
            this.shadowRoot.getElementById('export-btn').addEventListener('click', () => this.exportXLSX());
            this.shadowRoot.getElementById('form-save').addEventListener('click', () => this.saveSite());
            this.shadowRoot.getElementById('form-cancel').addEventListener('click', () => this.hideForm());

            // Поиск и фильтры - добавляем stopPropagation
            const searchMain = this.shadowRoot.getElementById('search-main');
            searchMain.addEventListener('keydown', (e) => e.stopPropagation());
            searchMain.addEventListener('keyup', (e) => e.stopPropagation());
            searchMain.addEventListener('keypress', (e) => e.stopPropagation());
            searchMain.addEventListener('input', (e) => { e.stopPropagation(); this.searchQuery = e.target.value; this.renderMainTable(); });
            this.shadowRoot.getElementById('filter-dept-main').addEventListener('change', (e) => { this.filterDepartment = e.target.value; this.renderMainTable(); });

            const searchOld = this.shadowRoot.getElementById('search-old');
            searchOld.addEventListener('keydown', (e) => e.stopPropagation());
            searchOld.addEventListener('keyup', (e) => e.stopPropagation());
            searchOld.addEventListener('keypress', (e) => e.stopPropagation());
            searchOld.addEventListener('input', (e) => { e.stopPropagation(); this.searchQuery = e.target.value; this.renderOldTable(); });
            this.shadowRoot.getElementById('filter-dept-old').addEventListener('change', (e) => { this.filterDepartment = e.target.value; this.renderOldTable(); });
            this.shadowRoot.getElementById('add-old-sub-btn').addEventListener('click', () => this.showOldSubForm(''));

            const searchNew = this.shadowRoot.getElementById('search-new');
            searchNew.addEventListener('keydown', (e) => e.stopPropagation());
            searchNew.addEventListener('keyup', (e) => e.stopPropagation());
            searchNew.addEventListener('keypress', (e) => e.stopPropagation());
            searchNew.addEventListener('input', (e) => { e.stopPropagation(); this.searchQuery = e.target.value; this.renderNewTable(); });
            this.shadowRoot.getElementById('filter-dept-new').addEventListener('change', (e) => { this.filterDepartment = e.target.value; this.renderNewTable(); });

            const importBtn = this.shadowRoot.getElementById('import-btn');
            const importMenu = this.shadowRoot.getElementById('import-menu');
            importBtn.addEventListener('click', (e) => { e.stopPropagation(); importMenu.classList.toggle('active'); });

            this.shadowRoot.querySelectorAll('.sites-import-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    this.importMode = e.target.closest('.sites-import-item').dataset.mode;
                    importMenu.classList.remove('active');
                    this.shadowRoot.getElementById('import-file-input').click();
                });
            });

            this.shadowRoot.addEventListener('click', () => importMenu.classList.remove('active'));
            this.shadowRoot.getElementById('import-file-input').addEventListener('change', (e) => {
                if (e.target.files[0]) this.importFile(e.target.files[0]);
                e.target.value = '';
            });
        }

        switchTab(tabName) {
            this.currentTab = tabName;
            this.searchQuery = '';
            this.filterDepartment = '';

            this.shadowRoot.querySelectorAll('.sites-tab').forEach(t => t.classList.remove('active'));
            this.shadowRoot.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

            this.shadowRoot.querySelectorAll('.sites-tab-content').forEach(c => c.classList.remove('active'));
            this.shadowRoot.getElementById(`content-${tabName}`).classList.add('active');

            this.shadowRoot.querySelectorAll('.sites-search').forEach(s => s.value = '');
            this.shadowRoot.querySelectorAll('.sites-filter-select').forEach(s => s.value = '');

            if (tabName === 'main') this.renderMainTable();
            if (tabName === 'old') this.renderOldTable();
            if (tabName === 'new') this.renderNewTable();
        }

        updateStats() {
            const stats = getSitesStats();
            this.shadowRoot.getElementById('stat-total').textContent = stats.totalSites;
            this.shadowRoot.getElementById('stat-active').textContent = stats.activeSites;
            this.shadowRoot.getElementById('stat-subdomains').textContent = stats.totalSubdomains;
            this.shadowRoot.getElementById('stat-avg').textContent = stats.avgSubdomainsPerSite;
        }

        renderMainTable() {
            const container = this.shadowRoot.getElementById('table-main');
            const sites = searchSites(this.searchQuery, this.filterDepartment);

            if (sites.length === 0) {
                container.innerHTML = '<div class="sites-empty">Сайты не найдены. Добавьте или импортируйте.</div>';
                return;
            }

            let html = '<table class="sites-table"><thead><tr><th>Домен</th><th>Отдел</th><th>CMS</th><th>hreflang</th><th>Подмена</th><th>URL дропа</th><th>oldURL</th><th>Флаги</th><th>Статус</th><th>Заметки</th><th>Действия</th></tr></thead><tbody>';
            sites.forEach(site => {
                const flags = [];
                if (site.hasAMP) flags.push('<span class="sites-badge sites-badge-amp">AMP</span>');
                if (site.dmcaDefault) flags.push('<span class="sites-badge sites-badge-dmca">DMCA</span>');
                const tplName = site.hreflangTemplate ? (loadTemplates()[site.hreflangTemplate]?.name || site.hreflangTemplate) : '';
                // v4.5.9: Отображаем новые поля
                const altDomain = site.alternateDomain || '';
                const toUrlVal = site.toUrl || '';
                const oldUrlVal = site.oldUrl || '';
                const notesVal = site.notes || '';
                const statusText = site.status === 'inactive' ? '🔴' : '🟢';
                html += `<tr>
                    <td style="font-weight:500; color:#000;">
                        ${site.domain}
                        ${this.onSelect ? `<button class="sites-action-btn sites-action-btn-select" data-action="select" data-domain="${site.domain}" title="Выбрать всё">✓</button>` : ''}
                    </td>
                    <td style="color:#000;">${site.department ? `<span class="sites-badge sites-badge-dept">${site.department}</span>` : '—'}</td>
                    <td style="color:#000;">${site.cms ? `<span class="sites-badge sites-badge-cms">${site.cms}</span>` : '—'}</td>
                    <td style="color:#000;">${tplName ? `<span class="sites-cell-text" title="${tplName}" style="color:#000;">${tplName.length > 10 ? tplName.substring(0,10)+'...' : tplName}</span>` : '—'}</td>
                    <td style="color:#000;">${altDomain ? `<span class="sites-cell-text" title="${altDomain}" style="color:#000;">${altDomain.length > 12 ? altDomain.substring(0,12)+'...' : altDomain}</span>` : '—'}</td>
                    <td style="color:#000;">${toUrlVal ? `<span class="sites-cell-text" title="${toUrlVal}" style="color:#000;">${toUrlVal.length > 12 ? toUrlVal.substring(0,12)+'...' : toUrlVal}</span>` : '—'}</td>
                    <td style="color:#000;">${oldUrlVal ? `<span class="sites-cell-text" title="${oldUrlVal}" style="color:#000;">${oldUrlVal.length > 12 ? oldUrlVal.substring(0,12)+'...' : oldUrlVal}</span>` : '—'}</td>
                    <td style="color:#000;">${flags.length ? flags.join(' ') : '—'}</td>
                    <td style="text-align:center;">${statusText}</td>
                    <td style="color:#000;">${notesVal ? `<span class="sites-cell-text" title="${notesVal}" style="color:#000;">${notesVal.length > 10 ? notesVal.substring(0,10)+'...' : notesVal}</span>` : '—'}</td>
                    <td>
                        <button class="sites-action-btn" data-action="edit" data-domain="${site.domain}" title="Редактировать">✏️</button>
                        <button class="sites-action-btn" data-action="delete" data-domain="${site.domain}" title="Удалить">🗑️</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;

            container.querySelectorAll('.sites-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const domain = btn.dataset.domain;
                    const action = btn.dataset.action;
                    const value = btn.dataset.value;
                    
                    if (action === 'edit') this.showForm(domain);
                    if (action === 'delete') this.deleteSite(domain);
                    // v4.5.7: Выбор всего сайта
                    if (action === 'select' && this.onSelect) {
                        const db = loadSitesDatabase();
                        const site = db[domain];
                        this.onSelect(domain, site);
                        this.close();
                    }
                });
            });
        }

        renderOldTable() {
            const container = this.shadowRoot.getElementById('table-old');
            const db = loadSitesDatabase();
            const query = this.searchQuery.toLowerCase();
            const rows = [];

            for (const domain in db) {
                const site = db[domain];
                if (this.filterDepartment && site.department !== this.filterDepartment) continue;
                if (!site.oldSubdomains || site.oldSubdomains.length === 0) continue;

                site.oldSubdomains.forEach(sub => {
                    if (query && !sub.url.toLowerCase().includes(query) && !domain.toLowerCase().includes(query)) return;
                    rows.push({ domain, department: site.department, ...sub });
                });
            }

            if (rows.length === 0) {
                container.innerHTML = '<div class="sites-empty">История поддоменов пуста</div>';
                return;
            }

            rows.sort((a, b) => (b.usedDate || '').localeCompare(a.usedDate || ''));

            let html = '<table class="sites-table"><thead><tr><th>Основной домен</th><th>Отдел</th><th>Старый поддомен</th><th>Действие</th><th>Дата</th><th>Действия</th></tr></thead><tbody>';
            rows.forEach(row => {
                const actionClass = row.action === '301' ? 'sites-badge-301' : 'sites-badge-404';
                html += `<tr>
                    <td style="font-weight:500;">${row.domain}</td>
                    <td>${row.department ? `<span class="sites-badge sites-badge-dept">${row.department}</span>` : '—'}</td>
                    <td class="sites-subdomain-cell">${row.url}</td>
                    <td><span class="sites-badge ${actionClass}">${row.action}</span></td>
                    <td class="sites-date-cell">${row.usedDate || '—'}</td>
                    <td>
                        <button class="sites-action-btn" data-action="edit-sub" data-domain="${row.domain}" data-url="${row.url}" data-action-type="${row.action}" data-date="${row.usedDate || ''}" title="Редактировать">✏️</button>
                        <button class="sites-action-btn" data-action="delete-sub" data-domain="${row.domain}" data-url="${row.url}" title="Удалить">🗑️</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;

            container.querySelectorAll('[data-action="delete-sub"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const domain = btn.dataset.domain;  // v4.3.7: btn вместо e.target
                    const url = btn.dataset.url;
                    if (confirm(`Удалить "${url}" из истории?`)) {
                        removeSubdomainFromSite(domain, url);
                        this.renderOldTable();
                        this.updateStats();
                    }
                });
            });

            // v4.3.5: Обработчик редактирования старого поддомена
            container.querySelectorAll('[data-action="edit-sub"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const domain = btn.dataset.domain;  // v4.3.7: btn вместо e.target
                    const url = btn.dataset.url;
                    const actionType = btn.dataset.actionType;
                    const date = btn.dataset.date;
                    this.showOldSubForm(domain, url, actionType, date);
                });
            });
        }

        renderNewTable() {
            const container = this.shadowRoot.getElementById('table-new');
            const db = loadSitesDatabase();
            const query = this.searchQuery.toLowerCase();
            const rows = [];

            for (const domain in db) {
                const site = db[domain];
                if (this.filterDepartment && site.department !== this.filterDepartment) continue;
                if (query && !domain.toLowerCase().includes(query) && !(site.currentSubdomain || '').toLowerCase().includes(query)) continue;

                rows.push({
                    domain,
                    department: site.department,
                    currentSubdomain: site.currentSubdomain || '',
                    lastTaskDate: site.lastTaskDate || ''
                });
            }

            if (rows.length === 0) {
                container.innerHTML = '<div class="sites-empty">Нет данных</div>';
                return;
            }

            rows.sort((a, b) => a.domain.localeCompare(b.domain));

            let html = '<table class="sites-table"><thead><tr><th>Основной домен</th><th>Отдел</th><th>Новый поддомен</th><th>Последняя задача</th><th>Действия</th></tr></thead><tbody>';
            rows.forEach(row => {
                html += `<tr>
                    <td style="font-weight:500;">${row.domain}</td>
                    <td>${row.department ? `<span class="sites-badge sites-badge-dept">${row.department}</span>` : '—'}</td>
                    <td class="sites-subdomain-cell">${row.currentSubdomain || '<span style="color:#999;">—</span>'}</td>
                    <td class="sites-date-cell">${row.lastTaskDate || '—'}</td>
                    <td>
                        <button class="sites-action-btn" data-action="edit-current" data-domain="${row.domain}" data-current="${row.currentSubdomain || ''}" title="Редактировать">✏️</button>
                    </td>
                </tr>`;
            });
            html += '</tbody></table>';
            container.innerHTML = html;

            // v4.3.5: Обработчик редактирования текущего поддомена
            container.querySelectorAll('[data-action="edit-current"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const domain = btn.dataset.domain;  // v4.3.7: btn вместо e.target
                    const current = btn.dataset.current;
                    this.showCurrentSubForm(domain, current);
                });
            });
        }

        showForm(domain = null) {
            this.editingDomain = domain;
            const form = this.shadowRoot.getElementById('site-form');
            this.shadowRoot.getElementById('form-title').textContent = domain ? `Редактировать: ${domain}` : 'Добавить сайт';
            form.style.display = 'block';

            if (domain) {
                const site = getSite(domain);
                this.shadowRoot.getElementById('form-domain').value = domain;
                this.shadowRoot.getElementById('form-domain').disabled = true;
                this.shadowRoot.getElementById('form-department').value = site.department || '';
                this.shadowRoot.getElementById('form-cms').value = site.cms || '';
                this.shadowRoot.getElementById('form-hreflang').value = site.hreflangTemplate || '';
                this.shadowRoot.getElementById('form-amp').checked = site.hasAMP || false;
                this.shadowRoot.getElementById('form-dmca').checked = site.dmcaDefault || false;
                this.shadowRoot.getElementById('form-status').value = site.status || 'active';
                // v4.5.9: Новые поля
                this.shadowRoot.getElementById('form-alternate').value = site.alternateDomain || '';
                this.shadowRoot.getElementById('form-tourl').value = site.toUrl || '';
                this.shadowRoot.getElementById('form-oldurl').value = site.oldUrl || '';
                this.shadowRoot.getElementById('form-notes').value = site.notes || '';
            } else {
                this.shadowRoot.getElementById('form-domain').value = '';
                this.shadowRoot.getElementById('form-domain').disabled = false;
                this.shadowRoot.getElementById('form-department').value = '';
                this.shadowRoot.getElementById('form-cms').value = '';
                this.shadowRoot.getElementById('form-hreflang').value = '';
                this.shadowRoot.getElementById('form-amp').checked = false;
                this.shadowRoot.getElementById('form-dmca').checked = false;
                this.shadowRoot.getElementById('form-status').value = 'active';
                // v4.5.9: Новые поля
                this.shadowRoot.getElementById('form-alternate').value = '';
                this.shadowRoot.getElementById('form-tourl').value = '';
                this.shadowRoot.getElementById('form-oldurl').value = '';
                this.shadowRoot.getElementById('form-notes').value = '';
            }
        }

        hideForm() {
            this.editingDomain = null;
            this.shadowRoot.getElementById('site-form').style.display = 'none';
        }

        saveSite() {
            const domain = this.shadowRoot.getElementById('form-domain').value.trim();
            if (!domain) { showToast('Введите домен'); return; }

            const data = {
                department: this.shadowRoot.getElementById('form-department').value,
                cms: this.shadowRoot.getElementById('form-cms').value,
                hreflangTemplate: this.shadowRoot.getElementById('form-hreflang').value,
                hasAMP: this.shadowRoot.getElementById('form-amp').checked,
                dmcaDefault: this.shadowRoot.getElementById('form-dmca').checked,
                status: this.shadowRoot.getElementById('form-status').value,
                // v4.5.9: Новые поля
                alternateDomain: this.shadowRoot.getElementById('form-alternate').value.trim(),
                toUrl: this.shadowRoot.getElementById('form-tourl').value.trim(),
                oldUrl: this.shadowRoot.getElementById('form-oldurl').value.trim(),
                notes: this.shadowRoot.getElementById('form-notes').value
            };

            if (this.editingDomain) updateSite(domain, data);
            else addSite(domain, data);

            this.hideForm();
            this.renderMainTable();
            this.updateStats();
            if (this.onUpdate) this.onUpdate();
        }

        deleteSite(domain) {
            if (confirm(`Удалить "${domain}" и всю историю поддоменов?`)) {
                removeSite(domain);
                this.renderMainTable();
                this.updateStats();
                if (this.onUpdate) this.onUpdate();
            }
        }

        // v4.3.5: Форма редактирования старого поддомена
        showOldSubForm(domain, url = '', actionType = '301', date = '') {
            const isEdit = !!url;
            const formHtml = `
                <div class="sites-form" id="old-sub-form" style="background: #fff3e0;">
                    <h3 class="sites-form-title">${isEdit ? 'Редактировать старый поддомен' : 'Добавить старый поддомен'}</h3>
                    <div class="sites-form-grid">
                        <div class="sites-form-group">
                            <label class="sites-form-label">Основной домен</label>
                            <input type="text" class="sites-form-input" id="old-sub-domain" value="${domain}" ${isEdit ? 'disabled' : ''} placeholder="example.com" />
                        </div>
                        <div class="sites-form-group">
                            <label class="sites-form-label">Старый поддомен</label>
                            <input type="text" class="sites-form-input" id="old-sub-url" value="${url}" placeholder="old.example.com" />
                        </div>
                        <div class="sites-form-group">
                            <label class="sites-form-label">Действие</label>
                            <select class="sites-form-select" id="old-sub-action">
                                <option value="301" ${actionType === '301' ? 'selected' : ''}>301 (редирект)</option>
                                <option value="404" ${actionType === '404' ? 'selected' : ''}>404 (удалён)</option>
                            </select>
                        </div>
                        <div class="sites-form-group">
                            <label class="sites-form-label">Дата</label>
                            <input type="date" class="sites-form-input" id="old-sub-date" value="${date}" />
                        </div>
                    </div>
                    <div class="sites-form-buttons">
                        <button class="sites-toolbar-btn sites-toolbar-btn-primary" id="old-sub-save">💾 Сохранить</button>
                        <button class="sites-toolbar-btn sites-toolbar-btn-secondary" id="old-sub-cancel">Отмена</button>
                    </div>
                </div>
            `;

            // Удаляем существующую форму если есть
            const existingForm = this.shadowRoot.getElementById('old-sub-form');
            if (existingForm) existingForm.remove();

            // Вставляем форму в начало body
            const body = this.shadowRoot.querySelector('.sites-body');
            body.insertAdjacentHTML('afterbegin', formHtml);

            // Обработчики
            this.shadowRoot.getElementById('old-sub-save').addEventListener('click', () => {
                const domainVal = this.shadowRoot.getElementById('old-sub-domain').value.trim();
                const urlVal = this.shadowRoot.getElementById('old-sub-url').value.trim();
                const actionVal = this.shadowRoot.getElementById('old-sub-action').value;
                const dateVal = this.shadowRoot.getElementById('old-sub-date').value;

                if (!domainVal || !urlVal) {
                    showToast('Заполните домен и поддомен');
                    return;
                }

                // Если редактируем - сначала удаляем старую запись
                if (isEdit && url) {
                    removeSubdomainFromSite(domain, url);
                }

                // Добавляем/обновляем запись
                addOldSubdomainToSite(domainVal, urlVal, actionVal, dateVal);

                this.shadowRoot.getElementById('old-sub-form').remove();
                this.renderOldTable();
                this.updateStats();
                if (this.onUpdate) this.onUpdate();
            });

            this.shadowRoot.getElementById('old-sub-cancel').addEventListener('click', () => {
                this.shadowRoot.getElementById('old-sub-form').remove();
            });
        }

        // v4.3.5: Форма редактирования текущего поддомена
        showCurrentSubForm(domain, current = '') {
            const formHtml = `
                <div class="sites-form" id="current-sub-form" style="background: #e3f2fd;">
                    <h3 class="sites-form-title">Редактировать текущий поддомен</h3>
                    <div class="sites-form-grid">
                        <div class="sites-form-group">
                            <label class="sites-form-label">Основной домен</label>
                            <input type="text" class="sites-form-input" id="current-sub-domain" value="${domain}" disabled />
                        </div>
                        <div class="sites-form-group">
                            <label class="sites-form-label">Новый поддомен</label>
                            <input type="text" class="sites-form-input" id="current-sub-url" value="${current}" placeholder="new.example.com" />
                        </div>
                    </div>
                    <div class="sites-form-buttons">
                        <button class="sites-toolbar-btn sites-toolbar-btn-primary" id="current-sub-save">💾 Сохранить</button>
                        <button class="sites-toolbar-btn sites-toolbar-btn-secondary" id="current-sub-cancel">Отмена</button>
                    </div>
                </div>
            `;

            // Удаляем существующую форму если есть
            const existingForm = this.shadowRoot.getElementById('current-sub-form');
            if (existingForm) existingForm.remove();

            // Вставляем форму в начало body
            const body = this.shadowRoot.querySelector('.sites-body');
            body.insertAdjacentHTML('afterbegin', formHtml);

            // Обработчики
            this.shadowRoot.getElementById('current-sub-save').addEventListener('click', () => {
                const domainVal = this.shadowRoot.getElementById('current-sub-domain').value.trim();
                const urlVal = this.shadowRoot.getElementById('current-sub-url').value.trim();

                if (!domainVal) {
                    showToast('Домен не указан');
                    return;
                }

                // Обновляем текущий поддомен
                updateSite(domainVal, { currentSubdomain: urlVal });

                this.shadowRoot.getElementById('current-sub-form').remove();
                this.renderNewTable();
                this.updateStats();
                if (this.onUpdate) this.onUpdate();
            });

            this.shadowRoot.getElementById('current-sub-cancel').addEventListener('click', () => {
                this.shadowRoot.getElementById('current-sub-form').remove();
            });
        }

        exportXLSX() {
            // FIX: Улучшенный экспорт с проверками и обратной связью
            try {
                const db = loadSitesDatabase();
                const dbKeys = Object.keys(db);

                if (dbKeys.length === 0) {
                    showToast('База сайтов пуста! Сначала добавьте сайты или импортируйте.');
                    return;
                }

                if(DEBUG) console.log('📤 Экспорт XLSX: ' + dbKeys.length + ' сайтов');

                const wb = XLSX.utils.book_new();

            const sheet1Data = [['domain', 'department', 'cms', 'status', 'hasAMP', 'dmcaDefault', 'hreflangTemplate', 'alternateDomain', 'toUrl', 'oldUrl', 'notes']];
            for (const domain in db) {
                const s = db[domain];
                sheet1Data.push([domain, s.department, s.cms, s.status, s.hasAMP ? 'true' : 'false', s.dmcaDefault ? 'true' : 'false', s.hreflangTemplate, s.alternateDomain || '', s.toUrl || '', s.oldUrl || '', s.notes]);
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), 'Основной домен');

            const sheet2Data = [['domain', 'subdomain', 'action', 'usedDate']];
            for (const domain in db) {
                (db[domain].oldSubdomains || []).forEach(s => {
                    sheet2Data.push([domain, s.url, s.action, s.usedDate]);
                });
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), 'Старый поддомен');

            const sheet3Data = [['domain', 'newSubdomain', 'priority', 'assigneeGid', 'projectGid']];
            for (const domain in db) {
                if (db[domain].currentSubdomain) {
                    sheet3Data.push([domain, db[domain].currentSubdomain, '', db[domain].assigneeGid, db[domain].projectGid]);
                }
            }
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet3Data), 'Новый поддомен');

            const filename = `sites_export_${new Date().toISOString().split('T')[0]}.xlsx`;
                XLSX.writeFile(wb, filename);

                // FIX: Показываем сообщение об успешном экспорте
                showToast('Экспорт завершён! Файл: ' + filename + '\nСайтов: ' + dbKeys.length);
            } catch (err) {
                console.error('Ошибка экспорта:', err);
                showToast('Ошибка экспорта: ' + err.message);
            }
        }

        importFile(file) {
            const mode = this.importMode || 'merge';
            const reader = new FileReader();
            reader.onload = (e) => {
                if (importSitesFromXLSX(e.target.result, mode)) {
                    showToast(mode === 'merge' ? 'Данные добавлены' : 'База заменена');
                    this.renderMainTable();
                    this.updateStats();
                    if (this.onUpdate) this.onUpdate();
                } else {
                    showToast('Ошибка импорта. Проверьте формат файла.', 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        close() {
            if (this.modalHost) this.modalHost.remove();
        }
    }
    // ===== КЛАСС ДЛЯ РЕДАКТИРОВАНИЯ ПОДЗАДАЧ МАССОВОЙ ЗАДАЧИ =====
    class TaskSubtasksEditorModal {
        constructor(parentShadowRoot, task, onSave) {
            this.parentShadowRoot = parentShadowRoot;
            this.task = task;
            this.onSave = onSave;
            this.modalHost = null;
            this.shadowRoot = null;
            // v4.5.2: Присваиваем id если его нет
            const loadedSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));
            loadedSubtasks.forEach((s, i) => {
                if (s.id === undefined) s.id = i + 1;
            });
            this.subtasks = loadedSubtasks;
            this.subtaskIdCounter = this.subtasks.length ? Math.max(...this.subtasks.map(s => s.id || 0)) + 1 : 1;
            // v4.3.7: Загружаем список участников команды
            this.teamMembers = loadTeamMembersFromCache().data || [];
        }

        show() {
            this.modalHost = document.createElement('div');
            this.modalHost.id = 'task-subtasks-editor-modal-host';
            document.body.appendChild(this.modalHost);
            this.shadowRoot = this.modalHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES + this.getModalStyles();
            this.shadowRoot.appendChild(styleSheet);

            const modal = document.createElement('div');
            modal.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(modal);

            this.attachEventListeners();
            this.renderSubtasks();
        }

        getModalStyles() {
            return `
                .subtask-editor-item {
                    background: #f8f9fa;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    padding: 12px;
                    margin-bottom: 10px;
                }
                .subtask-editor-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }
                .subtask-editor-number {
                    background: #9C27B0;
                    color: #fff;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 600;
                }
                .subtask-editor-name {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    background: #fff;
                    color: #333;
                }
                .subtask-editor-delete {
                    background: #f44336;
                    color: #fff;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .subtask-editor-fields {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 10px;
                }
                .subtask-editor-field label {
                    display: block;
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 4px;
                }
                .subtask-editor-field select,
                .subtask-editor-field input {
                    width: 100%;
                    padding: 6px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    background: #fff;
                    color: #333;
                }
                .subtask-editor-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 16px;
                }
                .btn-add-subtask-editor {
                    background: #4CAF50;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                }
                .btn-add-subtask-editor:hover {
                    background: #45a049;
                }
                .btn-load-templates {
                    background: #9C27B0;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                }
                .btn-load-templates:hover {
                    background: #7B1FA2;
                }
                .subtasks-empty {
                    text-align: center;
                    padding: 40px;
                    color: #999;
                    font-size: 14px;
                }
                /* v4.5.2: Секция закреплённых */
                .pinned-info-section {
                    background: #E8F5E9;
                    border: 1px solid #C8E6C9;
                    border-radius: 6px;
                    padding: 10px 14px;
                    margin-top: 12px;
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 8px;
                }
                .pinned-info-label {
                    font-weight: 600;
                    color: #2E7D32;
                    font-size: 13px;
                }
                .pinned-info-item {
                    background: #fff;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    color: #333;
                    border: 1px solid #A5D6A7;
                }
                .pinned-info-empty {
                    color: #888;
                    font-size: 12px;
                    font-style: italic;
                }
            `;
        }

        getHTML() {
            // v4.5.2: Собираем закреплённые подзадачи
            const subtaskTemplates = loadSubtaskTemplates();
            const pinnedSubtasks = [];
            Object.entries(subtaskTemplates).forEach(([dept, subtasks]) => {
                if (Array.isArray(subtasks)) {
                    subtasks.forEach((s) => {
                        if (s.pinned) {
                            pinnedSubtasks.push({ ...s, department: dept });
                        }
                    });
                }
            });

            const pinnedHTML = pinnedSubtasks.length === 0
                ? '<div class="pinned-info-empty">Нет закреплённых</div>'
                : pinnedSubtasks.map(s => {
                    const meta = [];
                    if (s.priority) meta.push(s.priority);
                    if (s.allocation) meta.push(s.allocation + '%');
                    return `<span class="pinned-info-item" title="${s.department}">${s.name}${meta.length ? ' (' + meta.join(', ') + ')' : ''}</span>`;
                }).join('');

            return `
                <div class="modal-overlay">
                    <div class="modal-content" style="max-width: 700px;">
                        <div class="modal-header">
                            <h3 class="modal-title">📋 Подзадачи: ${this.task.taskName}</h3>
                            <button class="modal-close-btn" id="close-modal">&times;</button>
                        </div>

                        <!-- v4.5.2: Инфо о закреплённых -->
                        <div class="pinned-info-section">
                            <span class="pinned-info-label">📌 Закреплённые:</span>
                            ${pinnedHTML}
                        </div>

                        <div class="subtask-editor-actions">
                            <button class="btn-add-subtask-editor" id="add-subtask-btn">
                                ➕ Добавить подзадачу
                            </button>
                            <button class="btn-load-templates" id="load-templates-btn">
                                📚 Загрузить типовые
                            </button>
                        </div>

                        <div id="subtasks-list" style="margin-top: 16px; max-height: 400px; overflow-y: auto;"></div>

                        <div class="modal-buttons">
                            <button class="btn-save" id="save-subtasks">💾 Сохранить</button>
                            <button class="btn-cancel" id="cancel-modal">Отмена</button>
                        </div>
                    </div>
                </div>
            `;
        }

        renderSubtasks() {
            const container = this.shadowRoot.getElementById('subtasks-list');
            if (!this.subtasks.length) {
                container.innerHTML = `
                    <div class="subtasks-empty">
                        Нет подзадач<br>
                        <span style="font-size: 12px;">Добавьте вручную или загрузите типовые</span>
                    </div>
                `;
                return;
            }

            container.innerHTML = this.subtasks.map((sub, i) => `
                <div class="subtask-editor-item" data-subtask-id="${sub.id}">
                    <div class="subtask-editor-header">
                        <span class="subtask-editor-number">${i + 1}</span>
                        <input type="text" class="subtask-editor-name" value="${sub.name}" data-field="name" placeholder="Название подзадачи" />
                        <button class="subtask-editor-delete" data-action="delete" type="button">🗑️</button>
                    </div>
                    <div class="subtask-editor-fields">
                        <div class="subtask-editor-field">
                            <label>Приоритет</label>
                            <select data-field="priority">
                                <option value="" ${!sub.priority ? 'selected' : ''}>—</option>
                                <option value="high" ${sub.priority === 'high' ? 'selected' : ''}>High</option>
                                <option value="medium" ${sub.priority === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="low" ${sub.priority === 'low' ? 'selected' : ''}>Low</option>
                            </select>
                        </div>
                        <div class="subtask-editor-field">
                            <label>Allocation (%)</label>
                            <input type="number" value="${sub.allocation || ''}" data-field="allocation" min="0" max="100" placeholder="—" />
                        </div>
                        <div class="subtask-editor-field">
                            <label>Исполнитель</label>
                            <select data-field="assignee">
                                <option value="">Не выбрано</option>
                                ${this.teamMembers.map(member => `
                                    <option value="${member.gid}" ${sub.assignee === member.gid ? 'selected' : ''}>
                                        ${member.name}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `).join('');

            // Привязываем события
            container.querySelectorAll('[data-field]').forEach(el => {
                // Предотвращаем всплытие событий к Asana
                el.addEventListener('keydown', (e) => e.stopPropagation());
                el.addEventListener('keyup', (e) => e.stopPropagation());
                el.addEventListener('keypress', (e) => e.stopPropagation());
                el.addEventListener('input', (e) => e.stopPropagation());
                el.addEventListener('focus', (e) => e.stopPropagation());

                el.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const item = e.target.closest('.subtask-editor-item');
                    const subtaskId = parseInt(item.dataset.subtaskId);
                    const field = e.target.dataset.field;
                    let value = e.target.value;
                    // v4.5.2: allocation может быть пустым
                    if (field === 'allocation') {
                        value = value ? parseFloat(value) : null;
                    }
                    const subtask = this.subtasks.find(s => s.id === subtaskId);
                    if (subtask) subtask[field] = value;
                });
            });

            container.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const item = btn.closest('.subtask-editor-item');
                    const subtaskId = parseInt(item.dataset.subtaskId);
                    this.subtasks = this.subtasks.filter(s => s.id !== subtaskId);
                    this.renderSubtasks();
                });
            });
        }

        attachEventListeners() {
            this.shadowRoot.getElementById('close-modal').addEventListener('click', () => this.close());
            this.shadowRoot.getElementById('cancel-modal').addEventListener('click', () => this.close());

            this.shadowRoot.getElementById('add-subtask-btn').addEventListener('click', () => {
                this.subtasks.push({
                    id: this.subtaskIdCounter++,
                    name: '',
                    priority: '',      // v4.5.2: пустое по умолчанию
                    allocation: null,  // v4.5.2: пустое по умолчанию
                    assignee: ''
                });
                this.renderSubtasks();
            });

            this.shadowRoot.getElementById('load-templates-btn').addEventListener('click', () => {
                this.showTemplatesSelector();
            });

            this.shadowRoot.getElementById('save-subtasks').addEventListener('click', () => {
                // Фильтруем пустые
                const validSubtasks = this.subtasks.filter(s => s.name && s.name.trim());
                this.onSave(validSubtasks);
                this.close();
            });
        }

        showTemplatesSelector() {
            // Открываем стандартное окно типовых подзадач
            const modal = new SubtaskTemplatesModal(this.shadowRoot, (selectedTemplates) => {
                // Добавляем выбранные подзадачи
                selectedTemplates.forEach(t => {
                    this.subtasks.push({
                        id: this.subtaskIdCounter++,
                        name: t.name,
                        priority: t.priority || 'medium',
                        allocation: t.allocation || 1,
                        assignee: t.assignee || ''
                    });
                });
                this.renderSubtasks();
            });
            modal.show();
        }

        close() {
            if (this.modalHost) {
                this.modalHost.remove();
            }
        }
    }

    // ===== КЛАСС ДЛЯ НАСТРОЕК ОТДЕЛОВ И CMS =====
    // ===== КЛАСС ДЛЯ ОБЩИХ НАСТРОЕК =====
    class UnifiedSettingsModal {
        constructor(parentShadowRoot, onSave) {
            this.parentShadowRoot = parentShadowRoot;
            this.onSave = onSave;
            this.modalHost = null;
            this.shadowRoot = null;
            this.departmentsConfig = loadDepartmentsConfig();
            this.cmsConfig = loadCmsConfig();
            this.rocketMapping = loadRocketChatMapping();
            this.teamMembers = [];
            this.projects = [];
            this.teams = []; // v4.3.7: Teams Asana
            this.rocketUsers = [];
            this.activeTab = 'departments';
        }

        async show() {
            // Загружаем team members из кеша
            const cache = loadTeamMembersFromCache();
            this.teamMembers = cache.data || [];

            if (this.teamMembers.length === 0) {
                try {
                    this.teamMembers = await fetchTeamMembersFromAPI();
                } catch (e) {
                    console.warn('Не удалось загрузить team members:', e);
                }
            }

            // Загружаем проекты
            try {
                this.projects = await getProjects();
            } catch (e) {
                console.warn('Не удалось загрузить проекты:', e);
                this.projects = [];
            }

            // v4.3.7: Загружаем Teams Asana
            try {
                this.teams = await getTeams();
                if(DEBUG) console.log('📊 Загружено teams:', this.teams.length);
            } catch (e) {
                console.warn('Не удалось загрузить teams:', e);
                this.teams = [];
            }

            // v4.3.7: Загружаем Rocket.Chat пользователей для автокомплита
            const rocketCache = loadRocketUsersFromCache();
            this.rocketUsers = rocketCache.data || [];

            this.modalHost = document.createElement('div');
            this.modalHost.id = 'unified-settings-modal-host';
            document.body.appendChild(this.modalHost);
            this.shadowRoot = this.modalHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES + this.getStyles();
            this.shadowRoot.appendChild(styleSheet);

            const modal = document.createElement('div');
            modal.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(modal);

            this.attachEventListeners();
            this.renderContent();
        }

        getStyles() {
            return `
                .settings-tabs {
                    display: flex;
                    border-bottom: 2px solid #e0e0e0;
                    margin-bottom: 16px;
                }
                .settings-tab {
                    flex: 1;
                    padding: 12px 16px;
                    background: #f5f5f5;
                    border: none;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #666;
                }
                .settings-tab:first-child {
                    border-radius: 6px 0 0 0;
                }
                .settings-tab:last-child {
                    border-radius: 0 6px 0 0;
                }
                .settings-tab.active {
                    background: #4CAF50;
                    color: #fff;
                }
                .settings-tab:hover:not(.active) {
                    background: #e8e8e8;
                }
                .settings-item {
                    display: grid;
                    grid-template-columns: 120px 1fr 1fr auto;
                    gap: 10px;
                    align-items: center;
                    padding: 12px;
                    background: #f9f9f9;
                    border-radius: 6px;
                    margin-bottom: 8px;
                }
                .settings-item-name {
                    font-weight: 500;
                    color: #333;
                }
                .settings-item-input {
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    background: #fff;
                    color: #333;
                }
                .settings-item-select {
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    background: #fff;
                    color: #333;
                }
                .settings-item-delete {
                    background: #f44336;
                    color: #fff;
                    border: none;
                    padding: 6px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .settings-item-delete:hover {
                    background: #d32f2f;
                }
                .settings-add-row {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 10px;
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid #e0e0e0;
                }
                .settings-add-input {
                    padding: 10px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                    background: #fff;
                    color: #333;
                }
                .settings-add-btn {
                    background: #4CAF50;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                }
                .settings-add-btn:hover {
                    background: #45a049;
                }
                .settings-content {
                    max-height: 400px;
                    overflow-y: auto;
                }
                .settings-header-row {
                    display: grid;
                    grid-template-columns: 120px 1fr 1fr auto;
                    gap: 10px;
                    padding: 8px 12px;
                    font-size: 12px;
                    color: #666;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .cms-settings-item {
                    display: grid;
                    grid-template-columns: 150px 1fr auto;
                    gap: 10px;
                    align-items: center;
                    padding: 12px;
                    background: #f9f9f9;
                    border-radius: 6px;
                    margin-bottom: 8px;
                }
                .cms-header-row {
                    display: grid;
                    grid-template-columns: 150px 1fr auto;
                    gap: 10px;
                    padding: 8px 12px;
                    font-size: 12px;
                    color: #666;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .mapping-item {
                    display: grid;
                    grid-template-columns: 1fr 30px 1fr 40px;
                    gap: 10px;
                    align-items: center;
                    padding: 10px 12px;
                    background: #f9f9f9;
                    border-radius: 6px;
                    margin-bottom: 6px;
                }
                .mapping-search-input {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    background: #fff;
                    color: #333;
                    box-sizing: border-box;
                }
                .mapping-search-input::placeholder {
                    color: #999;
                }
                .mapping-header-row {
                    display: grid;
                    grid-template-columns: 1fr 30px 1fr 40px;
                    gap: 10px;
                    padding: 8px 12px;
                    background: #e0e0e0;
                    font-weight: 600;
                    font-size: 12px;
                    color: #333;
                    border-radius: 4px;
                    margin: 0 12px 8px;
                }
                .mapping-arrow {
                    text-align: center;
                    color: #999;
                    font-size: 18px;
                }
                .mapping-input {
                    padding: 8px 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    background: #fff;
                    color: #333;
                    cursor: pointer;
                    transition: border-color 0.2s;
                }
                .mapping-input:hover {
                    border-color: #1976d2;
                }
                .mapping-input:focus {
                    outline: none;
                    border-color: #1976d2;
                    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
                }
                .mapping-clear {
                    background: #f44336;
                    color: #fff;
                    border: none;
                    padding: 6px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-left: 8px;
                }
                .mapping-clear:hover {
                    background: #d32f2f;
                }
                .rocket-dropdown {
                    position: fixed;
                    background: #fff;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    max-height: 250px;
                    overflow-y: auto;
                    z-index: 100001;
                    min-width: 220px;
                }
                .rocket-dropdown.hidden {
                    display: none;
                }
                .rocket-dropdown-search {
                    padding: 8px;
                    border-bottom: 1px solid #eee;
                    position: sticky;
                    top: 0;
                    background: #fff;
                }
                .rocket-dropdown-search input {
                    width: 100%;
                    padding: 6px 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 12px;
                    box-sizing: border-box;
                    background: #fff;
                    color: #333;
                }
                .rocket-dropdown-search input::placeholder {
                    color: #999;
                }
                .rocket-dropdown-item {
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 13px;
                    border-bottom: 1px solid #f0f0f0;
                }
                .rocket-dropdown-item:hover {
                    background: #e3f2fd;
                }
                .rocket-dropdown-item.used {
                    color: #999;
                    background: #f5f5f5;
                }
                .rocket-dropdown-item .username {
                    font-weight: 600;
                    color: #1976d2;
                }
                .rocket-dropdown-item .name {
                    color: #666;
                    font-size: 11px;
                    margin-left: 8px;
                }
                .rocket-dropdown-empty {
                    padding: 16px;
                    text-align: center;
                    color: #999;
                    font-size: 12px;
                }
            `;
        }

        getHTML() {
            return `
                <div class="modal-overlay">
                    <div class="modal-content" style="max-width: 750px; position: relative;">
                        <div class="modal-header">
                            <h3 class="modal-title">⚙️ Настройки</h3>
                            <button class="modal-close-btn" id="close-modal">&times;</button>
                        </div>

                        <div class="settings-tabs">
                            <button class="settings-tab active" data-tab="departments">🏢 Отделы</button>
                            <button class="settings-tab" data-tab="cms">💻 CMS</button>
                            <button class="settings-tab" data-tab="mapping">🚀 Rocket.Chat</button>
                            <button class="settings-tab" data-tab="cloud">☁️ Облако</button>
                        </div>

                        <div id="settings-container"></div>

                        <div class="modal-buttons">
                            <button class="btn-save" id="save-settings">💾 Сохранить</button>
                            <button class="btn-cancel" id="cancel-modal">Отмена</button>
                        </div>
                    </div>
                </div>
            `;
        }

        renderContent() {
            const container = this.shadowRoot.getElementById('settings-container');
            if (this.activeTab === 'departments') {
                container.innerHTML = this.renderDepartments();
            } else if (this.activeTab === 'cms') {
                container.innerHTML = this.renderCms();
            } else if (this.activeTab === 'cloud') {
                container.innerHTML = this.renderCloud();
            } else {
                container.innerHTML = this.renderMapping();
            }
            this.attachContentListeners();
        }

        renderDepartments() {
            const depts = Object.entries(this.departmentsConfig);
            const hasTeams = this.teams && this.teams.length > 0;

            return `
                <div class="settings-header-row" style="${hasTeams ? 'grid-template-columns: 100px 1fr 1fr 1fr auto;' : ''}">
                    <span>Название</span>
                    ${hasTeams ? '<span>Команда</span>' : ''}
                    <span>Проект Asana</span>
                    <span>Ответственный</span>
                    <span></span>
                </div>
                <div class="settings-content">
                    ${depts.map(([name, config]) => `
                        <div class="settings-item" data-dept="${name}" style="${hasTeams ? 'grid-template-columns: 100px 1fr 1fr 1fr auto;' : ''}">
                            <div class="settings-item-name">${name}</div>
                            ${hasTeams ? `
                                <select class="settings-item-select" data-field="teamGid">
                                    <option value="">— Все проекты —</option>
                                    ${this.teams.map(t => `
                                        <option value="${t.gid}" ${config.teamGid === t.gid ? 'selected' : ''}>${t.name}</option>
                                    `).join('')}
                                </select>
                            ` : ''}
                            <select class="settings-item-select" data-field="projectGid">
                                <option value="">— Выберите проект —</option>
                                ${this.projects.map(p => `
                                    <option value="${p.gid}" ${config.projectGid === p.gid ? 'selected' : ''}>${p.name}</option>
                                `).join('')}
                            </select>
                            <select class="settings-item-select" data-field="assigneeGid">
                                <option value="">— Не назначен —</option>
                                ${this.teamMembers.map(m => `
                                    <option value="${m.gid}" ${config.assigneeGid === m.gid ? 'selected' : ''}>${m.name}</option>
                                `).join('')}
                            </select>
                            <button class="settings-item-delete" data-action="delete-dept" data-dept="${name}">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                <div class="settings-add-row">
                    <input type="text" class="settings-add-input" id="new-dept-name" placeholder="Название нового отдела" />
                    <button class="settings-add-btn" id="add-dept-btn">➕ Добавить</button>
                </div>
            `;
        }

        renderCms() {
            const cmsList = Object.entries(this.cmsConfig);
            return `
                <div class="cms-header-row">
                    <span>Название</span>
                    <span>Ответственный</span>
                    <span></span>
                </div>
                <div class="settings-content">
                    ${cmsList.map(([key, config]) => `
                        <div class="cms-settings-item" data-cms="${key}">
                            <div class="settings-item-name">${config.name || key}</div>
                            <select class="settings-item-select" data-field="assigneeGid">
                                <option value="">— Не назначен —</option>
                                ${this.teamMembers.map(m => `
                                    <option value="${m.gid}" ${config.assigneeGid === m.gid ? 'selected' : ''}>${m.name}</option>
                                `).join('')}
                            </select>
                            <button class="settings-item-delete" data-action="delete-cms" data-cms="${key}">🗑️</button>
                        </div>
                    `).join('')}
                </div>
                <div class="settings-add-row">
                    <input type="text" class="settings-add-input" id="new-cms-name" placeholder="Название CMS (например: Drupal)" />
                    <button class="settings-add-btn" id="add-cms-btn">➕ Добавить</button>
                </div>
            `;
        }

        renderMapping() {
            const availableCount = this.rocketUsers.length;
            const mappedCount = Object.keys(this.rocketMapping).filter(k => this.rocketMapping[k]).length;

            return `
                <div style="padding: 8px 12px; font-size: 12px; color: #666; margin-bottom: 8px;">
                    Укажите @username в Rocket.Chat для каждого пользователя Asana
                    <div style="margin-top: 4px; color: #999;">
                        📊 Rocket.Chat: ${availableCount} пользователей | Замаплено: ${mappedCount}
                    </div>
                </div>
                <div style="padding: 0 12px 8px;">
                    <input type="text" id="mapping-search" class="mapping-search-input"
                           placeholder="🔍 Поиск по имени или username..." autocomplete="off" />
                </div>
                <div class="mapping-header-row">
                    <span>Asana</span>
                    <span></span>
                    <span>Rocket.Chat</span>
                    <span></span>
                </div>
                <div class="settings-content" id="mapping-list">
                    ${this.teamMembers.map(member => {
                        const currentMapping = this.rocketMapping[member.gid] || '';
                        return `
                            <div class="mapping-item" data-gid="${member.gid}">
                                <div class="settings-item-name">👤 ${member.name}</div>
                                <div class="mapping-arrow">→</div>
                                <input type="text" class="mapping-input" placeholder="Нажмите для выбора"
                                       value="${currentMapping}" data-gid="${member.gid}" autocomplete="off" readonly />
                                ${currentMapping ? `<button class="mapping-clear" data-gid="${member.gid}">✖</button>` : '<span></span>'}
                            </div>
                        `;
                    }).join('')}
                </div>
                <div id="rocket-dropdown" class="rocket-dropdown hidden"></div>
            `;
        }

        // v4.5.0: Вкладка облачных настроек (Google Sheets / Microsoft)
        // v4.5.3: Дефолтный URL для Google Apps Script + авторизация
        renderCloud() {
            const cloudProvider = GM_getValue('cloudProvider', 'google');
            const googleScriptUrl = GM_getValue('googleAppsScriptUrl', CONFIG.cloud.defaultGoogleScriptUrl);
            const powerAutomateUrl = GM_getValue('powerAutomateUrl', '');
            const rocketWebhook = CONFIG.rocketChat?.webhookUrl || GM_getValue('rocketWebhookUrl', '');

            // v4.5.3: Получаем текущие credentials (может быть null)
            const auth = getCloudAuth() || { username: '', password: '' };

            return `
                <div class="cloud-settings">
                    <!-- v4.5.3: Секция авторизации -->
                    <div class="cloud-section" id="auth-section">
                        <h4>🔐 Авторизация</h4>
                        <p class="cloud-hint">Учётные данные для доступа к облачным сервисам</p>

                        <div class="cloud-field">
                            <label>Логин:</label>
                            <input type="text" id="cloud-username" class="cloud-input"
                                   value="${auth.username}"
                                   placeholder="admin" autocomplete="off" />
                        </div>

                        <div class="cloud-field">
                            <label>Пароль:</label>
                            <div style="display: flex; gap: 8px;">
                                <input type="password" id="cloud-password" class="cloud-input"
                                       value="${auth.password}"
                                       placeholder="••••••••" autocomplete="off" style="flex: 1;" />
                                <button type="button" id="toggle-password" class="btn-toggle-pass" title="Показать/скрыть">👁️</button>
                            </div>
                        </div>
                    </div>

                    <div class="cloud-section" id="google-section">
                        <h4>📊 Google Sheets</h4>
                        <p class="cloud-hint">Настройте Google Apps Script для сохранения ТЗ</p>

                        <div class="cloud-field">
                            <label>Google Apps Script URLs (по одному на строку):</label>
                            <textarea id="google-script-urls" class="cloud-textarea" rows="4"
                                   placeholder="https://script.google.com/macros/s/.../exec&#10;https://script.google.com/macros/s/.../exec">${googleScriptUrl}</textarea>
                            <small style="color:#888;">💡 Несколько URL = распределение нагрузки (round-robin + failover)</small>
                        </div>

                        <div class="cloud-field" style="margin-top: 12px;">
                            <label class="cloud-checkbox-label">
                                <input type="checkbox" id="cloud-parallel-mode" ${GM_getValue('cloudParallelMode', false) ? 'checked' : ''} />
                                ⚡ Параллельная отправка (быстрее, но больше нагрузка)
                            </label>
                        </div>

                        <div class="cloud-instructions">
                            <b>📖 Инструкция:</b>
                            <ol>
                                <li>Откройте <a href="https://script.google.com" target="_blank">script.google.com</a></li>
                                <li>Создайте новый проект (New project)</li>
                                <li>Вставьте код из файла GoogleAppsScript_TZ_Cloud.js</li>
                                <li>Deploy → New deployment → Web app</li>
                                <li>Execute as: Me, Who has access: Anyone</li>
                                <li>Скопируйте URL и вставьте выше</li>
                                <li><b>Для балансировки:</b> создайте 2-5 копий скрипта</li>
                            </ol>
                            <p style="margin-top:8px;color:#666;">💡 Каждая генерация создаёт новую таблицу в Google Drive</p>
                        </div>
                    </div>

                    <div class="cloud-section">
                        <h4>🚀 Rocket.Chat Webhook</h4>
                        <p class="cloud-hint">URL для отправки уведомлений ответственным</p>

                        <div class="cloud-field">
                            <label>Webhook URL:</label>
                            <input type="text" id="rocket-webhook-url" class="cloud-input"
                                   value="${rocketWebhook}"
                                   placeholder="https://rocket.chat/hooks/..." />
                        </div>
                    </div>

                    <div class="cloud-test">
                        <button id="test-cloud-connection" class="btn-test">🔗 Проверить подключение</button>
                        <div id="cloud-test-result" class="cloud-test-result"></div>
                    </div>
                </div>

                <style>
                    .cloud-settings { padding: 16px; }
                    .cloud-test {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        margin-top: 16px;
                    }
                    .cloud-test-result {
                        font-size: 12px;
                        padding: 8px;
                        background: #f5f5f5;
                        border-radius: 6px;
                        min-height: 20px;
                    }
                    .cloud-test-result:empty { display: none; }
                    .cloud-section {
                        background: #f9f9f9;
                        border-radius: 8px;
                        padding: 16px;
                        margin-bottom: 16px;
                    }
                    .cloud-section h4 { margin: 0 0 8px 0; color: #333; }
                    .btn-toggle-pass {
                        background: #555;
                        border: 1px solid #666;
                        border-radius: 6px;
                        padding: 8px 12px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .btn-toggle-pass:hover { background: #666; }
                    .cloud-hint { font-size: 12px; color: #666; margin: 0 0 12px 0; }
                    .cloud-field { margin-bottom: 12px; }
                    .cloud-field label { display: block; font-size: 13px; margin-bottom: 4px; color: #555; }
                    .cloud-input {
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        font-size: 13px;
                        box-sizing: border-box;
                        background: #3a3a3a;
                        color: #fff;
                    }
                    .cloud-input:focus { outline: none; border-color: #4CAF50; }
                    .cloud-textarea {
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        font-size: 12px;
                        font-family: monospace;
                        box-sizing: border-box;
                        background: #2a2a3a;
                        color: #4fc3f7;
                        resize: vertical;
                        min-height: 80px;
                    }
                    .cloud-textarea:focus { outline: none; border-color: #4CAF50; }
                    .cloud-checkbox-label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        color: #555;
                        cursor: pointer;
                    }
                    .cloud-checkbox-label input { width: 16px; height: 16px; cursor: pointer; }
                    .cloud-instructions {
                        border-radius: 6px;
                        padding: 12px;
                        font-size: 12px;
                        background: #fff;
                        color: #333;
                        border: 1px solid #e0e0e0;
                    }
                    .cloud-instructions b { color: #333; }
                    .cloud-instructions ol { margin: 8px 0 0 0; padding-left: 20px; color: #555; }
                    .cloud-instructions li { margin: 4px 0; }
                    .cloud-instructions a { color: #1976D2; }
                    .btn-test {
                        background: #4CAF50;
                        color: white;
                        border: none;
                        padding: 10px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                        width: 100%;
                    }
                    .btn-test:hover { background: #45a049; }
                    .btn-test:disabled { background: #999; cursor: wait; }

                    .cloud-provider-toggle {
                        display: flex;
                        gap: 12px;
                    }
                    .provider-option {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 16px;
                        border: 2px solid #e0e0e0;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                        background: #fff;
                        color: #333;
                    }
                    .provider-option:hover {
                        border-color: #4CAF50;
                    }
                    .provider-option.active {
                        border-color: #4CAF50;
                        background: #fff;
                        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
                    }
                    .provider-option input {
                        display: none;
                    }
                    .provider-icon {
                        font-size: 20px;
                    }
                </style>
            `;
        }

        // v4.3.7: Получить доступные Rocket.Chat username (не использованные в маппинге)
        getAvailableRocketUsers(currentGid) {
            const usedUsernames = new Set(
                Object.entries(this.rocketMapping)
                    .filter(([gid, username]) => gid !== currentGid && username)
                    .map(([gid, username]) => username.toLowerCase())
            );

            return this.rocketUsers.filter(u =>
                u.username && !usedUsernames.has('@' + u.username.toLowerCase())
            );
        }

        // v4.3.7: Обновить все datalist'ы (убрать уже использованные username)
        updateAllDataLists() {
            this.teamMembers.forEach(member => {
                const datalist = this.shadowRoot.getElementById(`rocket-users-${member.gid}`);
                if (datalist) {
                    const availableUsers = this.getAvailableRocketUsers(member.gid);
                    datalist.innerHTML = availableUsers.map(u =>
                        `<option value="@${u.username}">${u.name || u.username}</option>`
                    ).join('');
                }
            });
        }

        // v4.3.7: Показать dropdown с Rocket.Chat пользователями
        showRocketDropdown(gid, btn) {
            const dropdown = this.shadowRoot.getElementById('rocket-dropdown');
            if (!dropdown) return;

            const availableUsers = this.getAvailableRocketUsers(gid);
            const usedUsernames = new Set(
                Object.entries(this.rocketMapping)
                    .filter(([g, u]) => g !== gid && u)
                    .map(([g, u]) => u.toLowerCase())
            );

            // Все пользователи: доступные + использованные (помечены)
            const allUsers = this.rocketUsers.map(u => ({
                ...u,
                isUsed: usedUsernames.has('@' + u.username.toLowerCase())
            })).sort((a, b) => {
                // Сначала доступные, потом использованные
                if (a.isUsed !== b.isUsed) return a.isUsed ? 1 : -1;
                return (a.name || a.username).localeCompare(b.name || b.username);
            });

            if (allUsers.length === 0) {
                dropdown.innerHTML = `<div class="rocket-dropdown-empty">Нет пользователей Rocket.Chat в кеше.<br>Проверьте настройки API.</div>`;
            } else {
                dropdown.innerHTML = `
                    <div class="rocket-dropdown-search">
                        <input type="text" placeholder="🔍 Поиск..." id="rocket-dropdown-search" />
                    </div>
                    <div id="rocket-dropdown-list">
                        ${allUsers.map(u => `
                            <div class="rocket-dropdown-item ${u.isUsed ? 'used' : ''}" data-username="@${u.username}" data-gid="${gid}">
                                <span class="username">@${u.username}</span>
                                <span class="name">${u.name || ''}</span>
                                ${u.isUsed ? '<span style="color: #f44336; margin-left: 8px;">✗</span>' : ''}
                            </div>
                        `).join('')}
                    </div>
                `;

                // Обработчик поиска
                const searchInput = dropdown.querySelector('#rocket-dropdown-search');
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase();
                    dropdown.querySelectorAll('.rocket-dropdown-item').forEach(item => {
                        const text = item.textContent.toLowerCase();
                        item.style.display = text.includes(query) ? '' : 'none';
                    });
                });
                searchInput.addEventListener('keydown', (e) => e.stopPropagation());
                searchInput.addEventListener('keyup', (e) => e.stopPropagation());

                // Обработчик выбора
                dropdown.querySelectorAll('.rocket-dropdown-item').forEach(item => {
                    item.addEventListener('click', () => {
                        if (item.classList.contains('used')) {
                            if (!confirm('Этот пользователь уже назначен. Всё равно выбрать?')) return;
                        }
                        const username = item.dataset.username;
                        const targetGid = item.dataset.gid;
                        this.rocketMapping[targetGid] = username;

                        // Обновляем input
                        const input = this.shadowRoot.querySelector(`.mapping-input[data-gid="${targetGid}"]`);
                        if (input) input.value = username;

                        this.hideRocketDropdown();
                        this.renderContent();
                    });
                });
            }

            // Позиционирование dropdown (fixed относительно viewport)
            const rect = btn.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 5) + 'px';
            dropdown.style.left = Math.max(10, rect.left - 150) + 'px';

            dropdown.classList.remove('hidden');

            // Фокус на поиск
            setTimeout(() => {
                const searchInput = dropdown.querySelector('#rocket-dropdown-search');
                if (searchInput) searchInput.focus();
            }, 50);
        }

        // v4.3.7: Скрыть dropdown
        hideRocketDropdown() {
            const dropdown = this.shadowRoot.getElementById('rocket-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }

        attachEventListeners() {
            this.shadowRoot.getElementById('close-modal').addEventListener('click', () => this.close());
            this.shadowRoot.getElementById('cancel-modal').addEventListener('click', () => this.close());

            this.shadowRoot.querySelectorAll('.settings-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    this.activeTab = e.target.dataset.tab;
                    this.shadowRoot.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    this.renderContent();
                });
            });

            this.shadowRoot.getElementById('save-settings').addEventListener('click', () => {
                saveDepartmentsConfig(this.departmentsConfig);
                saveCmsConfig(this.cmsConfig);
                saveRocketChatMapping(this.rocketMapping);

                // v4.5.3: Сохраняем credentials
                const usernameInput = this.shadowRoot.getElementById('cloud-username');
                const passwordInput = this.shadowRoot.getElementById('cloud-password');
                if (usernameInput && passwordInput) {
                    const username = usernameInput.value.trim();
                    const password = passwordInput.value;
                    if (username && password) {
                        saveCloudAuth(username, password);
                    }
                }

                // v4.5.0: Сохраняем облачные настройки
                const cloudProvider = this.shadowRoot.querySelector('input[name="cloud-provider"]:checked')?.value;
                const googleUrlsTextarea = this.shadowRoot.getElementById('google-script-urls');
                const powerAutomateInput = this.shadowRoot.getElementById('power-automate-url');
                const rocketWebhookInput = this.shadowRoot.getElementById('rocket-webhook-url');
                const parallelModeCheckbox = this.shadowRoot.getElementById('cloud-parallel-mode');

                if (cloudProvider) {
                    GM_setValue('cloudProvider', cloudProvider);
                }
                if (googleUrlsTextarea) {
                    // v4.5.5: Сохраняем все URL (многострочный)
                    GM_setValue('googleAppsScriptUrl', googleUrlsTextarea.value.trim());
                }
                if (powerAutomateInput) {
                    GM_setValue('powerAutomateUrl', powerAutomateInput.value.trim());
                }
                if (rocketWebhookInput) {
                    GM_setValue('rocketWebhookUrl', rocketWebhookInput.value.trim());
                }
                if (parallelModeCheckbox) {
                    GM_setValue('cloudParallelMode', parallelModeCheckbox.checked);
                }

                if (this.onSave) this.onSave();
                this.close();
            });
        }

        attachContentListeners() {
            // Обработчики для полей отделов
            this.shadowRoot.querySelectorAll('.settings-item').forEach(item => {
                const deptName = item.dataset.dept;
                if (!deptName) return;

                item.querySelectorAll('select, input').forEach(el => {
                    el.addEventListener('keydown', (e) => e.stopPropagation());
                    el.addEventListener('keyup', (e) => e.stopPropagation());
                    el.addEventListener('keypress', (e) => e.stopPropagation());
                    el.addEventListener('input', (e) => e.stopPropagation());
                    el.addEventListener('focus', (e) => e.stopPropagation());
                    el.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const field = e.target.dataset.field;
                        this.departmentsConfig[deptName][field] = e.target.value;
                    });
                });
            });

            // v4.5.0: Переключение облачного провайдера
            this.shadowRoot.querySelectorAll('input[name="cloud-provider"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const provider = e.target.value;
                    const googleSection = this.shadowRoot.getElementById('google-section');
                    const microsoftSection = this.shadowRoot.getElementById('microsoft-section');

                    if (googleSection) googleSection.style.display = provider === 'google' ? '' : 'none';
                    if (microsoftSection) microsoftSection.style.display = provider === 'microsoft' ? '' : 'none';

                    // Обновляем активный класс
                    this.shadowRoot.querySelectorAll('.provider-option').forEach(opt => {
                        opt.classList.toggle('active', opt.querySelector('input').value === provider);
                    });
                });
            });

            // v4.5.3: Toggle password visibility
            const togglePassBtn = this.shadowRoot.getElementById('toggle-password');
            const passwordInput = this.shadowRoot.getElementById('cloud-password');
            if (togglePassBtn && passwordInput) {
                togglePassBtn.addEventListener('click', () => {
                    const type = passwordInput.type === 'password' ? 'text' : 'password';
                    passwordInput.type = type;
                    togglePassBtn.textContent = type === 'password' ? '👁️' : '🙈';
                });
            }

            // v4.5.3: Stop propagation для полей авторизации
            ['cloud-username', 'cloud-password'].forEach(id => {
                const input = this.shadowRoot.getElementById(id);
                if (input) {
                    input.addEventListener('keydown', (e) => e.stopPropagation());
                    input.addEventListener('keyup', (e) => e.stopPropagation());
                    input.addEventListener('keypress', (e) => e.stopPropagation());
                }
            });

            // Обработчики для полей CMS
            this.shadowRoot.querySelectorAll('.cms-settings-item').forEach(item => {
                const cmsKey = item.dataset.cms;
                if (!cmsKey) return;

                item.querySelectorAll('select, input').forEach(el => {
                    el.addEventListener('keydown', (e) => e.stopPropagation());
                    el.addEventListener('keyup', (e) => e.stopPropagation());
                    el.addEventListener('keypress', (e) => e.stopPropagation());
                    el.addEventListener('input', (e) => e.stopPropagation());
                    el.addEventListener('focus', (e) => e.stopPropagation());
                    el.addEventListener('change', (e) => {
                        e.stopPropagation();
                        const field = e.target.dataset.field;
                        this.cmsConfig[cmsKey][field] = e.target.value;
                    });
                });
            });

            // v4.3.7: Поиск по маппингу
            const mappingSearch = this.shadowRoot.getElementById('mapping-search');
            if (mappingSearch) {
                mappingSearch.addEventListener('keydown', (e) => e.stopPropagation());
                mappingSearch.addEventListener('keyup', (e) => e.stopPropagation());
                mappingSearch.addEventListener('input', (e) => {
                    e.stopPropagation();
                    const query = e.target.value.toLowerCase();
                    this.shadowRoot.querySelectorAll('.mapping-item').forEach(item => {
                        const name = item.querySelector('.settings-item-name')?.textContent.toLowerCase() || '';
                        const username = item.querySelector('.mapping-input')?.value.toLowerCase() || '';
                        const gid = item.dataset.gid?.toLowerCase() || '';
                        const matches = name.includes(query) || username.includes(query) || gid.includes(query);
                        item.style.display = matches ? '' : 'none';
                    });
                });
            }

            // Обработчики для маппинга Rocket
            this.shadowRoot.querySelectorAll('.mapping-input').forEach(input => {
                input.addEventListener('keydown', (e) => e.stopPropagation());
                input.addEventListener('keyup', (e) => e.stopPropagation());
                input.addEventListener('keypress', (e) => e.stopPropagation());
                input.addEventListener('input', (e) => e.stopPropagation());
                input.addEventListener('focus', (e) => e.stopPropagation());
                // v4.3.7: Клик на input открывает dropdown
                input.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const gid = input.dataset.gid;
                    this.showRocketDropdown(gid, input);
                });
            });

            // v4.3.7: Закрытие dropdown при клике вне его
            this.shadowRoot.addEventListener('click', (e) => {
                if (!e.target.closest('.rocket-dropdown') && !e.target.closest('.mapping-input')) {
                    this.hideRocketDropdown();
                }
            });

            // v4.3.7: Кнопка очистки маппинга
            this.shadowRoot.querySelectorAll('.mapping-clear').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const gid = btn.dataset.gid;
                    delete this.rocketMapping[gid];
                    this.renderContent();
                });
            });

            // Удаление отдела
            this.shadowRoot.querySelectorAll('[data-action="delete-dept"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const deptName = e.target.dataset.dept;
                    if (confirm(`Удалить отдел "${deptName}"?`)) {
                        delete this.departmentsConfig[deptName];
                        this.renderContent();
                    }
                });
            });

            // Удаление CMS
            this.shadowRoot.querySelectorAll('[data-action="delete-cms"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const cmsKey = e.target.dataset.cms;
                    if (confirm(`Удалить CMS "${cmsKey}"?`)) {
                        delete this.cmsConfig[cmsKey];
                        this.renderContent();
                    }
                });
            });

            // Добавление отдела
            const addDeptBtn = this.shadowRoot.getElementById('add-dept-btn');
            if (addDeptBtn) {
                addDeptBtn.addEventListener('click', () => {
                    const input = this.shadowRoot.getElementById('new-dept-name');
                    const name = input.value.trim();
                    if (name && !this.departmentsConfig[name]) {
                        this.departmentsConfig[name] = { projectGid: '', assigneeGid: '', rocketUsername: '' };
                        input.value = '';
                        this.renderContent();
                    }
                });
            }

            // Добавление CMS
            const addCmsBtn = this.shadowRoot.getElementById('add-cms-btn');
            if (addCmsBtn) {
                addCmsBtn.addEventListener('click', () => {
                    const input = this.shadowRoot.getElementById('new-cms-name');
                    const name = input.value.trim();
                    if (name) {
                        const key = name.toLowerCase().replace(/\s+/g, '_');
                        if (!this.cmsConfig[key]) {
                            this.cmsConfig[key] = { name: name, assigneeGid: '' };
                            input.value = '';
                            this.renderContent();
                        }
                    }
                });
            }

            // v4.5.6: Обработчик теста облачного подключения (проверяет все URL по очереди с live-обновлением)
            const testCloudBtn = this.shadowRoot.getElementById('test-cloud-connection');
            if (testCloudBtn) {
                testCloudBtn.addEventListener('click', async () => {
                    const resultEl = this.shadowRoot.getElementById('cloud-test-result');
                    const googleUrlsRaw = this.shadowRoot.getElementById('google-script-urls')?.value?.trim();
                    
                    if (!googleUrlsRaw) {
                        resultEl.innerHTML = '<span style="color: orange;">⚠️ Введите Google Apps Script URL</span>';
                        return;
                    }

                    // v4.5.6: Парсим несколько URL
                    const googleUrls = googleUrlsRaw.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));
                    
                    if (googleUrls.length === 0) {
                        resultEl.innerHTML = '<span style="color: orange;">⚠️ Нет валидных URL</span>';
                        return;
                    }

                    testCloudBtn.disabled = true;
                    testCloudBtn.textContent = '⏳ Проверяю...';
                    
                    const results = [];
                    
                    // Функция обновления результата
                    const updateResult = () => {
                        const lines = results.map((r, i) => {
                            const icon = r.status === 'ok' ? '✅' : r.status === 'error' ? '❌' : '⚠️';
                            const color = r.status === 'ok' ? '#4CAF50' : r.status === 'error' ? '#f44336' : '#ff9800';
                            const shortUrl = '...' + r.url.slice(-20);
                            return `<div style="font-size:11px;color:${color}">${icon} #${i+1} ${shortUrl} ${r.error ? '(' + r.error + ')' : ''}</div>`;
                        }).join('');
                        
                        const okCount = results.filter(r => r.status === 'ok').length;
                        const total = googleUrls.length;
                        const checked = results.length;
                        
                        let summary = '';
                        if (checked < total) {
                            summary = `<div style="margin-bottom:4px;color:#666;">⏳ Проверено: ${checked}/${total}</div>`;
                        } else {
                            const color = okCount === total ? '#4CAF50' : okCount > 0 ? '#ff9800' : '#f44336';
                            summary = `<div style="margin-bottom:4px;color:${color};font-weight:bold;">Результат: ${okCount}/${total} ✓</div>`;
                        }
                        
                        resultEl.innerHTML = summary + lines;
                    };
                    
                    for (let i = 0; i < googleUrls.length; i++) {
                        const url = googleUrls[i];
                        
                        // Проверяем формат URL
                        if (!url.includes('script.google.com/macros')) {
                            results.push({ url, status: 'invalid', error: 'Неверный формат' });
                            updateResult();
                            continue;
                        }

                        try {
                            await new Promise((resolve, reject) => {
                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: url,
                                    timeout: 10000,
                                    onload: (res) => {
                                        if (res.status === 200 || res.status === 404) {
                                            resolve();
                                        } else if (res.status === 401 || res.status === 403) {
                                            reject(new Error('Авторизация'));
                                        } else {
                                            reject(new Error(`HTTP ${res.status}`));
                                        }
                                    },
                                    onerror: () => reject(new Error('Сеть')),
                                    ontimeout: () => reject(new Error('Таймаут'))
                                });
                            });
                            results.push({ url, status: 'ok' });
                        } catch (e) {
                            results.push({ url, status: 'error', error: e.message });
                        }
                        
                        updateResult();
                    }

                    testCloudBtn.disabled = false;
                    testCloudBtn.textContent = '🔗 Проверить подключение';
                });
            }
        }

        close() {
            if (this.modalHost) {
                this.modalHost.remove();
            }
        }
    }

    // ===== v4.5.0: УНИФИЦИРОВАННЫЙ КЛАСС НАСТРОЕК ПОЛЕЙ =====
    class FieldConfigModal {
        constructor(parentShadowRoot, onUpdate) {
            this.parentShadowRoot = parentShadowRoot;
            this.onUpdate = onUpdate;
            this.modalHost = null;
            this.shadowRoot = null;
            this.fieldSettings = loadFieldSettings() || {};
            this.taskTypes = loadTaskTypes();
            this.currentTab = 'types';
            this.currentTypeId = 'subdomain';
            this.editingType = null;
        }

        show() {
            this.modalHost = document.createElement('div');
            this.modalHost.id = 'unified-settings-modal-host';
            document.body.appendChild(this.modalHost);

            this.shadowRoot = this.modalHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES + this.getStyles();
            this.shadowRoot.appendChild(styleSheet);

            const modal = document.createElement('div');
            modal.className = 'unified-modal-overlay';
            modal.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(modal);

            this.attachEventListeners();
            this.switchTab('types');  // v4.5.5: исправлено - вкладка types вместо несуществующей fields
        }

        getStyles() {
            return `
                .unified-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000001;
                }
                .unified-modal-content {
                    background: #fff;
                    border-radius: 12px;
                    width: 850px;
                    max-width: 95vw;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                }
                .unified-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid #e0e0e0;
                    background: linear-gradient(135deg, #37474F, #263238);
                    border-radius: 12px 12px 0 0;
                }
                .unified-modal-title {
                    color: #fff;
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                }
                .unified-close-btn {
                    background: none;
                    border: none;
                    color: #fff;
                    font-size: 28px;
                    cursor: pointer;
                    padding: 0 8px;
                    line-height: 1;
                }
                .unified-close-btn:hover {
                    color: #ffcdd2;
                }

                /* Вкладки */
                .unified-tabs {
                    display: flex;
                    border-bottom: 2px solid #e0e0e0;
                    background: #fafafa;
                }
                .unified-tab {
                    flex: 1;
                    padding: 14px 20px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    color: #666;
                    transition: all 0.2s;
                    border-bottom: 3px solid transparent;
                    margin-bottom: -2px;
                }
                .unified-tab:hover {
                    background: #f0f0f0;
                    color: #333;
                }
                .unified-tab.active {
                    background: #fff;
                    color: #1976D2;
                    border-bottom-color: #1976D2;
                }

                /* Контент */
                .unified-body {
                    padding: 20px;
                    overflow-y: auto;
                    flex: 1;
                    min-height: 400px;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }

                /* Информационный блок */
                .info-box {
                    background: #E3F2FD;
                    border: 1px solid #90CAF9;
                    border-radius: 8px;
                    padding: 12px 16px;
                    margin-bottom: 20px;
                    font-size: 13px;
                    color: #1565C0;
                }
                .info-box b { color: #0D47A1; }

                /* Поля */
                .field-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 14px 16px;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    margin-bottom: 10px;
                    background: #fafafa;
                    transition: all 0.2s;
                }
                .field-item:hover {
                    background: #f5f5f5;
                    border-color: #bdbdbd;
                }
                .field-drag-handle {
                    cursor: grab;
                    color: #999;
                    font-size: 18px;
                    padding-top: 2px;
                }
                .field-checkbox {
                    width: 20px;
                    height: 20px;
                    cursor: pointer;
                    margin-top: 2px;
                }
                .field-info {
                    flex: 1;
                    min-width: 0;
                }
                .field-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }
                .field-label {
                    font-weight: 600;
                    color: #333;
                    font-size: 14px;
                }
                .field-variable {
                    font-size: 12px;
                    color: #666;
                    font-family: 'Consolas', 'Monaco', monospace;
                    background: #e8e8e8;
                    padding: 3px 8px;
                    border-radius: 4px;
                }
                .field-required-badge {
                    font-size: 11px;
                    color: #fff;
                    background: #f44336;
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .field-type-badge {
                    font-size: 11px;
                    color: #fff;
                    background: #9e9e9e;
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .field-custom-badge {
                    font-size: 11px;
                    color: #fff;
                    background: #9C27B0;
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                .field-actions {
                    display: flex;
                    gap: 6px;
                    margin-left: auto;
                }
                .field-edit-btn, .field-delete-btn {
                    background: transparent;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .field-edit-btn:hover {
                    background: #e3f2fd;
                    border-color: #1976D2;
                }
                .field-delete-btn:hover {
                    background: #ffebee;
                    border-color: #f44336;
                }

                /* Aliases */
                .field-aliases-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .field-aliases-label {
                    font-size: 12px;
                    color: #888;
                    white-space: nowrap;
                }
                .field-aliases-input {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 13px;
                    color: #333;
                    background: #fff;
                }
                .field-aliases-input:focus {
                    outline: none;
                    border-color: #1976D2;
                    box-shadow: 0 0 0 2px rgba(25,118,210,0.1);
                }
                .alias-reset-btn {
                    background: transparent;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 6px 10px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                    flex-shrink: 0;
                }
                .alias-reset-btn:hover {
                    background: #fff3e0;
                    border-color: #FF9800;
                }

                /* Теги aliases */
                .alias-field-item {
                    flex-direction: column;
                    align-items: stretch !important;
                }
                .aliases-tags-container {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    margin-top: 8px;
                }
                .aliases-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    flex: 1;
                    padding: 8px;
                    background: #f5f5f5;
                    border-radius: 6px;
                    min-height: 38px;
                    align-items: center;
                }
                .alias-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: #e3f2fd;
                    border: 1px solid #90caf9;
                    border-radius: 4px;
                    font-size: 12px;
                    color: #1565c0;
                }
                .alias-tag-remove {
                    background: none;
                    border: none;
                    color: #1565c0;
                    cursor: pointer;
                    font-size: 14px;
                    padding: 0 2px;
                    line-height: 1;
                    opacity: 0.7;
                }
                .alias-tag-remove:hover {
                    opacity: 1;
                    color: #d32f2f;
                }
                .alias-add-inline {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .alias-add-input {
                    border: 1px dashed #bdbdbd;
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 12px;
                    color: #333;
                    background: #fff;
                    width: 100px;
                    transition: all 0.2s;
                }
                .alias-add-input:focus {
                    outline: none;
                    border-color: #4CAF50;
                    border-style: solid;
                    width: 140px;
                }
                .alias-add-input::placeholder {
                    color: #9e9e9e;
                }
                .alias-add-btn {
                    background: #4CAF50;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    width: 28px;
                    height: 28px;
                    font-size: 18px;
                    font-weight: bold;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    flex-shrink: 0;
                    margin-left: 4px;
                }
                .alias-add-btn:hover {
                    background: #388E3C;
                    transform: scale(1.1);
                }
                .aliases-example-box {
                    margin-top: 20px;
                    padding: 14px 18px;
                    background: #E8F5E9;
                    border: 1px solid #A5D6A7;
                    border-radius: 8px;
                    font-size: 13px;
                    color: #2E7D32;
                }
                .aliases-example-box b {
                    color: #1B5E20;
                }

                /* Типы задач */
                .type-selector-row {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 16px;
                }
                .type-selector {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                }
                .type-selector label {
                    font-weight: 600;
                    color: #333;
                }
                .type-selector select {
                    flex: 1;
                    padding: 10px 14px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                    background: #fff;
                    color: #333;
                }
                .type-selector select option {
                    color: #333;
                    background: #fff;
                }
                .type-actions {
                    display: flex;
                    gap: 8px;
                }
                .type-edit-btn, .type-delete-btn {
                    background: transparent;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 16px;
                    transition: all 0.2s;
                }
                .type-edit-btn:hover {
                    background: #e3f2fd;
                    border-color: #1976D2;
                }
                .type-delete-btn:hover {
                    background: #ffebee;
                    border-color: #f44336;
                }
                .type-add-btn {
                    background: #4CAF50;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                .type-add-btn:hover {
                    background: #388E3C;
                }
                .type-name-display {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: #f5f5f5;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .type-icon-large {
                    font-size: 28px;
                }
                .type-name-large {
                    font-size: 18px;
                    font-weight: 600;
                    color: #333;
                }
                .type-custom-badge {
                    font-size: 11px;
                    color: #fff;
                    background: #9C27B0;
                    padding: 3px 8px;
                    border-radius: 4px;
                    margin-left: auto;
                }
                .type-fields-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .type-field-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                    background: #fafafa;
                }
                .type-field-item label {
                    color: #333;
                    font-size: 13px;
                    color: #333;
                    cursor: pointer;
                }
                .type-field-item input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                }

                /* Шаблон ТЗ */
                .template-section {
                    margin-top: 20px;
                }
                .template-section label {
                    display: block;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 8px;
                }
                .template-textarea {
                    width: 100%;
                    min-height: 200px;
                    padding: 14px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 13px;
                    line-height: 1.5;
                    resize: vertical;
                    background: #f9f9f9;
                    color: #333;
                }
                .template-textarea:focus {
                    outline: none;
                    border-color: #1976D2;
                    background: #fff;
                }
                .template-variables {
                    margin-top: 10px;
                    padding: 10px;
                    background: #FFF8E1;
                    border: 1px solid #FFE082;
                    border-radius: 6px;
                    font-size: 12px;
                    color: #F57F17;
                }
                .template-variables code {
                    background: #fff;
                    padding: 2px 6px;
                    border-radius: 3px;
                    margin: 0 3px;
                    color: #333;
                }
                .template-variables code.var-used {
                    background: #C8E6C9;
                    border: 1px solid #81C784;
                    color: #2E7D32;
                    font-weight: 600;
                }

                /* Используемые переменные в шаблоне */
                .used-vars-section {
                    margin-top: 12px;
                    padding: 12px;
                    background: #E3F2FD;
                    border: 1px solid #90CAF9;
                    border-radius: 6px;
                }
                .used-vars-section b {
                    color: #1565C0;
                    font-size: 13px;
                }
                .used-vars-list {
                    margin-top: 8px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .used-var-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    background: #fff;
                    border: 1px solid #64B5F6;
                    border-radius: 4px;
                    font-size: 12px;
                    color: #1976D2;
                    font-family: monospace;
                }
                .used-var-tag.checked {
                    background: #E8F5E9;
                    border-color: #81C784;
                    color: #2E7D32;
                }
                .used-var-tag.auxiliary {
                    background: #F5F5F5;
                    border-color: #BDBDBD;
                    color: #757575;
                }
                .used-var-tag small {
                    color: #666;
                    font-family: sans-serif;
                }
                .used-vars-hint {
                    display: block;
                    margin-top: 8px;
                    color: #666;
                    font-size: 11px;
                }
                .no-vars {
                    color: #999;
                    font-style: italic;
                }

                /* Добавление нового поля */
                .add-field-section {
                    margin-top: 20px;
                    padding: 16px;
                    border: 2px dashed #ddd;
                    border-radius: 8px;
                    background: #fafafa;
                }
                .add-field-title {
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 12px;
                }
                .add-field-row {
                    display: flex;
                    gap: 10px;
                    align-items: flex-end;
                }
                .add-field-group {
                    flex: 1;
                }
                .add-field-group label {
                    display: block;
                    font-size: 12px;
                    color: #666;
                    margin-bottom: 4px;
                }
                .add-field-group input,
                .add-field-group select {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 13px;
                    color: #333;
                    background: #fff;
                }
                .add-field-btn {
                    padding: 8px 16px;
                    background: #4CAF50;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                    white-space: nowrap;
                }
                .add-field-btn:hover {
                    background: #388E3C;
                }

                /* Footer */
                .unified-modal-footer {
                    padding: 16px 20px;
                    border-top: 1px solid #e0e0e0;
                    display: flex;
                    justify-content: space-between;
                    background: #fafafa;
                    border-radius: 0 0 12px 12px;
                }
                .footer-left {
                    display: flex;
                    gap: 10px;
                }
                .footer-right {
                    display: flex;
                    gap: 10px;
                }
                .btn-reset {
                    padding: 10px 20px;
                    background: #f44336;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                }
                .btn-reset:hover { background: #d32f2f; }
                .btn-cancel {
                    padding: 10px 24px;
                    background: #9e9e9e;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                }
                .btn-cancel:hover { background: #757575; }
                .btn-save {
                    padding: 10px 28px;
                    background: #4CAF50;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                }
                .btn-save:hover { background: #388E3C; }
            `;
        }

        getHTML() {
            return `
                <div class="unified-modal-content">
                    <div class="unified-modal-header">
                        <h3 class="unified-modal-title">⚙️ Настройка полей</h3>
                        <button class="unified-close-btn" id="close-unified-modal">&times;</button>
                    </div>

                    <div class="unified-tabs">
                        <button class="unified-tab" data-tab="aliases">🏷️ Aliases импорта</button>
                        <button class="unified-tab active" data-tab="types">📝 Типы задач</button>
                    </div>

                    <div class="unified-body">
                        <!-- Вкладка 1: Aliases -->
                        <div class="tab-content" id="tab-aliases">
                            <div class="info-box">
                                💡 <b>Aliases</b> — альтернативные названия колонок для импорта из Excel.<br>
                                При импорте скрипт автоматически сопоставит колонку с полем по названию или alias.<br>
                                Разделяйте aliases запятой.
                            </div>
                            <div id="aliases-list"></div>
                        </div>

                        <!-- Вкладка 2: Типы задач -->
                        <div class="tab-content active" id="tab-types">
                            <div class="info-box">
                                💡 <b>Типы задач</b> — настройте какие поля используются для каждого типа задачи<br>
                                и отредактируйте шаблон ТЗ. Используйте переменные <code>{{domain}}</code>, <code>{{oldSub}}</code>, <code>{{newSub}}</code> и др.
                            </div>
                            <div id="types-content"></div>
                        </div>
                    </div>

                    <div class="unified-modal-footer">
                        <div class="footer-left">
                            <button class="btn-reset" id="reset-settings">🔄 Сбросить всё</button>
                        </div>
                        <div class="footer-right">
                            <button class="btn-cancel" id="cancel-settings">Отмена</button>
                            <button class="btn-save" id="save-settings">💾 Сохранить</button>
                        </div>
                    </div>
                </div>
            `;
        }

        attachEventListeners() {
            // Закрытие только крестиком или кнопками
            this.shadowRoot.getElementById('close-unified-modal').addEventListener('click', () => this.close());
            this.shadowRoot.getElementById('cancel-settings').addEventListener('click', () => this.close());
            this.shadowRoot.getElementById('save-settings').addEventListener('click', () => this.save());
            this.shadowRoot.getElementById('reset-settings').addEventListener('click', () => this.reset());

            // Вкладки
            this.shadowRoot.querySelectorAll('.unified-tab').forEach(tab => {
                tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
            });

            // НЕ закрываем по клику на overlay - только крестиком
        }

        switchTab(tabName) {
            this.currentTab = tabName;

            // Обновляем активную вкладку
            this.shadowRoot.querySelectorAll('.unified-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === tabName);
            });

            // Показываем контент
            this.shadowRoot.querySelectorAll('.tab-content').forEach(content => {
                content.classList.toggle('active', content.id === `tab-${tabName}`);
            });

            // Рендерим контент вкладки
            if (tabName === 'fields') this.renderFieldsTab();
            if (tabName === 'aliases') this.renderAliasesTab();
            if (tabName === 'types') this.renderTypesTab();
        }

        renderFieldsTab() {
            const container = this.shadowRoot.getElementById('fields-list');
            const taskType = this.taskTypes[this.currentTypeId] || this.taskTypes['subdomain'];
            const enabledFields = taskType?.fields || [];

            // Загружаем пользовательские поля
            const customFields = this.fieldSettings._customFields || [];
            const allFields = { ...FIELD_REGISTRY };
            customFields.forEach(cf => {
                allFields[cf.id] = cf;
            });

            const fieldsHTML = Object.entries(allFields).map(([fieldId, field]) => {
                const fieldConfig = enabledFields.find(f => f.fieldId === fieldId);
                const isEnabled = fieldConfig?.enabled ?? true;
                const isRequired = fieldConfig?.required ?? false;
                const isCustom = customFields.some(cf => cf.id === fieldId);

                return `
                    <div class="field-item" data-field-id="${fieldId}">
                        <span class="field-drag-handle">☰</span>
                        <input type="checkbox" class="field-checkbox" data-field-id="${fieldId}"
                               ${isEnabled ? 'checked' : ''} title="Показывать в таблице" />
                        <div class="field-info">
                            <div class="field-header">
                                <span class="field-label">${field.label}</span>
                                <span class="field-variable">${field.variable || '{{' + fieldId + '}}'}</span>
                                <span class="field-type-badge">${field.type}</span>
                                ${isRequired ? '<span class="field-required-badge">обяз.</span>' : ''}
                                ${isCustom ? '<span class="field-custom-badge">свой</span>' : ''}
                            </div>
                        </div>
                        <div class="field-actions">
                            <button class="field-edit-btn" data-field-id="${fieldId}" title="Редактировать">✏️</button>
                            ${isCustom ? `<button class="field-delete-btn" data-field-id="${fieldId}" title="Удалить">🗑️</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Секция добавления нового поля
            const addFieldSection = `
                <div class="add-field-section">
                    <div class="add-field-title">➕ Добавить своё поле</div>
                    <div class="add-field-row">
                        <div class="add-field-group">
                            <label>Название</label>
                            <input type="text" id="new-field-label" placeholder="Мой параметр" />
                        </div>
                        <div class="add-field-group">
                            <label>ID (англ.)</label>
                            <input type="text" id="new-field-id" placeholder="myParam" />
                        </div>
                        <div class="add-field-group">
                            <label>Тип</label>
                            <select id="new-field-type">
                                <option value="text">Текст</option>
                                <option value="select">Выбор</option>
                                <option value="checkbox">Чекбокс</option>
                                <option value="textarea">Текстовое поле</option>
                            </select>
                        </div>
                        <button class="add-field-btn" id="add-new-field-btn">➕ Добавить</button>
                    </div>
                </div>
            `;

            container.innerHTML = fieldsHTML + addFieldSection;

            // Обработчики
            container.querySelectorAll('.field-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => this.editField(btn.dataset.fieldId));
            });
            container.querySelectorAll('.field-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => this.deleteCustomField(btn.dataset.fieldId));
            });
            this.shadowRoot.getElementById('add-new-field-btn')?.addEventListener('click', () => this.addNewField());

            // Блокируем всплытие для input
            container.querySelectorAll('input[type="text"]').forEach(input => {
                ['keydown', 'keyup', 'input'].forEach(evt => {
                    input.addEventListener(evt, e => e.stopPropagation());
                });
            });
        }

        // Редактирование поля
        editField(fieldId) {
            const customFields = this.fieldSettings._customFields || [];
            const customField = customFields.find(cf => cf.id === fieldId);
            const field = customField || FIELD_REGISTRY[fieldId];

            if (!field) return;

            const newLabel = prompt(`Название поля "${field.label}":`, field.label);
            if (newLabel === null) return;

            const newVariable = prompt(`Переменная (например {{${fieldId}}}):`, field.variable || `{{${fieldId}}}`);
            if (newVariable === null) return;

            if (customField) {
                // Редактируем кастомное поле
                customField.label = newLabel;
                customField.variable = newVariable;
            } else {
                // Создаём override для встроенного поля
                if (!this.fieldSettings._fieldOverrides) {
                    this.fieldSettings._fieldOverrides = {};
                }
                this.fieldSettings._fieldOverrides[fieldId] = {
                    label: newLabel,
                    variable: newVariable
                };
            }

            this.renderFieldsTab();
        }

        // Добавление нового поля
        addNewField() {
            const label = this.shadowRoot.getElementById('new-field-label').value.trim();
            const id = this.shadowRoot.getElementById('new-field-id').value.trim();
            const type = this.shadowRoot.getElementById('new-field-type').value;

            if (!label || !id) {
                showToast('Заполните название и ID поля');
                return;
            }

            // Проверяем уникальность ID
            if (FIELD_REGISTRY[id] || (this.fieldSettings._customFields || []).some(cf => cf.id === id)) {
                showToast('Поле с таким ID уже существует');
                return;
            }

            // Валидация ID (только латиница и цифры)
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(id)) {
                showToast('ID должен начинаться с буквы и содержать только латиницу, цифры и _');
                return;
            }

            const newField = {
                id: id,
                label: label,
                type: type,
                variable: `{{${id}}}`,
                width: 'medium',
                aliases: [label.toLowerCase(), id.toLowerCase()],
                isCustom: true
            };

            if (!this.fieldSettings._customFields) {
                this.fieldSettings._customFields = [];
            }
            this.fieldSettings._customFields.push(newField);

            // Очищаем форму
            this.shadowRoot.getElementById('new-field-label').value = '';
            this.shadowRoot.getElementById('new-field-id').value = '';

            this.renderFieldsTab();
            showToast(' Поле "' + label + '" добавлено!\n\nПеременная: {{' + id + '}}');
        }

        // Удаление кастомного поля
        deleteCustomField(fieldId) {
            if (!confirm(`Удалить поле "${fieldId}"?`)) return;

            if (this.fieldSettings._customFields) {
                this.fieldSettings._customFields = this.fieldSettings._customFields.filter(cf => cf.id !== fieldId);
            }

            this.renderFieldsTab();
        }

        renderAliasesTab() {
            const container = this.shadowRoot.getElementById('aliases-list');

            // Включаем custom fields
            const customFields = this.fieldSettings._customFields || [];
            const allFields = { ...FIELD_REGISTRY };
            customFields.forEach(cf => {
                allFields[cf.id] = cf;
            });

            const aliasesHTML = Object.entries(allFields).map(([fieldId, field]) => {
                const userAliases = this.fieldSettings[fieldId]?.aliases;
                const aliases = userAliases || field.aliases || [];
                const isCustom = field.isCustom || customFields.some(cf => cf.id === fieldId);

                // Генерируем теги
                const tagsHTML = aliases.map((alias, idx) => `
                    <span class="alias-tag" data-field-id="${fieldId}" data-index="${idx}">
                        ${alias}
                        <button class="alias-tag-remove" data-field-id="${fieldId}" data-alias="${alias}">×</button>
                    </span>
                `).join('');

                return `
                    <div class="field-item alias-field-item" data-field-id="${fieldId}">
                        <div class="field-info" style="width: 100%;">
                            <div class="field-header">
                                <span class="field-label">${field.label}</span>
                                <span class="field-variable">${field.variable || '{{' + fieldId + '}}'}</span>
                                ${isCustom ? '<span class="field-custom-badge">свой</span>' : ''}
                            </div>
                            <div class="aliases-tags-container">
                                <div class="aliases-tags" data-field-id="${fieldId}">
                                    ${tagsHTML}
                                    <div class="alias-add-inline">
                                        <input type="text" class="alias-add-input" data-field-id="${fieldId}"
                                               placeholder="новый alias..." />
                                        <button class="alias-add-btn" data-field-id="${fieldId}" title="Добавить">+</button>
                                    </div>
                                </div>
                                <button class="alias-reset-btn" data-field-id="${fieldId}" title="Сбросить к дефолту">↩️</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Информация о том как работают aliases
            const infoSection = `
                <div class="aliases-example-box">
                    <b>💡 Как добавить alias:</b> Введите слово и нажмите <b>+</b> или Enter.<br>
                    <b>Пример:</b> Если в Excel колонка "Дроп", добавьте alias "дроп" для поля "Домен".
                </div>
            `;

            container.innerHTML = aliasesHTML + infoSection;

            // Обработчики для добавления alias
            container.querySelectorAll('.alias-add-input').forEach(input => {
                // Единый обработчик keydown
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = input.value.trim();
                        if(DEBUG) console.log('Enter pressed, value:', val);
                        if (val) {
                            this.addAlias(input.dataset.fieldId, val);
                            input.value = '';
                        }
                    }
                });

                // Блокируем всплытие для остальных событий
                ['keyup', 'input'].forEach(evt => {
                    input.addEventListener(evt, e => e.stopPropagation());
                });
            });

            // Обработчики для кнопки добавления
            container.querySelectorAll('.alias-add-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const fieldId = btn.dataset.fieldId;
                    const input = container.querySelector(`.alias-add-input[data-field-id="${fieldId}"]`);
                    const val = input?.value.trim();
                    if(DEBUG) console.log('Add button clicked, fieldId:', fieldId, 'value:', val);
                    if (val) {
                        this.addAlias(fieldId, val);
                        input.value = '';
                        input.focus();
                    } else {
                        input?.focus();
                    }
                });
            });

            // Обработчики для удаления alias
            container.querySelectorAll('.alias-tag-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeAlias(btn.dataset.fieldId, btn.dataset.alias);
                });
            });

            // Обработчик сброса aliases
            container.querySelectorAll('.alias-reset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fieldId = btn.dataset.fieldId;
                    const defaultField = FIELD_REGISTRY[fieldId];
                    if (defaultField?.aliases) {
                        this.fieldSettings[fieldId] = { aliases: [...defaultField.aliases] };
                    } else {
                        delete this.fieldSettings[fieldId];
                    }
                    this.renderAliasesTab();
                });
            });
        }

        // Добавление alias
        addAlias(fieldId, alias) {
            if (!alias) return;

            const aliasLower = alias.toLowerCase().trim();
            if (!aliasLower) return;

            // Инициализируем aliases если нужно
            if (!this.fieldSettings[fieldId] || !Array.isArray(this.fieldSettings[fieldId].aliases)) {
                const defaultField = FIELD_REGISTRY[fieldId];
                const customField = (this.fieldSettings._customFields || []).find(cf => cf.id === fieldId);
                const defaultAliases = defaultField?.aliases || customField?.aliases || [];
                this.fieldSettings[fieldId] = {
                    ...this.fieldSettings[fieldId],
                    aliases: [...defaultAliases]
                };
            }

            // Проверяем дубликат
            if (this.fieldSettings[fieldId].aliases.includes(aliasLower)) {
                return;
            }

            this.fieldSettings[fieldId].aliases.push(aliasLower);
            if(DEBUG) console.log('Added alias:', fieldId, aliasLower, this.fieldSettings);
            this.renderAliasesTab();
        }

        // Удаление alias
        removeAlias(fieldId, alias) {
            // Инициализируем aliases если нужно
            if (!this.fieldSettings[fieldId] || !Array.isArray(this.fieldSettings[fieldId].aliases)) {
                const defaultField = FIELD_REGISTRY[fieldId];
                const customField = (this.fieldSettings._customFields || []).find(cf => cf.id === fieldId);
                const defaultAliases = defaultField?.aliases || customField?.aliases || [];
                this.fieldSettings[fieldId] = {
                    ...this.fieldSettings[fieldId],
                    aliases: [...defaultAliases]
                };
            }

            this.fieldSettings[fieldId].aliases = this.fieldSettings[fieldId].aliases.filter(a => a !== alias);
            console.log('Removed alias:', fieldId, alias, this.fieldSettings);
            this.renderAliasesTab();
        }

        renderTypesTab() {
            const container = this.shadowRoot.getElementById('types-content');
            const taskType = this.taskTypes[this.currentTypeId];

            // Включаем custom fields
            const customFields = this.fieldSettings._customFields || [];
            const allFields = { ...FIELD_REGISTRY };
            customFields.forEach(cf => {
                allFields[cf.id] = cf;
            });

            // Проверяем является ли тип встроенным
            const isBuiltInType = ['subdomain', 'redirect301', 'redirect404', 'disableAlternateDomain', 'hreflang', 'reindex', 'clone', 'audit'].includes(this.currentTypeId);

            // Селектор типа задачи
            const typesOptions = Object.entries(this.taskTypes)
                .map(([id, type]) => `<option value="${id}" ${id === this.currentTypeId ? 'selected' : ''}>${type.icon || '📋'} ${type.name}</option>`)
                .join('');

            // Поля для текущего типа
            const fieldsGrid = Object.entries(allFields).map(([fieldId, field]) => {
                const fieldConfig = taskType?.fields?.find(f => f.fieldId === fieldId);
                const isEnabled = fieldConfig?.enabled ?? false;

                return `
                    <div class="type-field-item">
                        <input type="checkbox" id="type-field-${fieldId}" data-field-id="${fieldId}"
                               ${isEnabled ? 'checked' : ''} />
                        <label for="type-field-${fieldId}">${field.label}</label>
                    </div>
                `;
            }).join('');

            // Извлекаем переменные из текущего шаблона
            const tzTemplate = taskType?.tzTemplate || '';
            const usedVarsMatches = tzTemplate.match(/\{\{(\w+)\}\}/g) || [];
            const usedVars = [...new Set(usedVarsMatches.map(m => m.replace(/\{\{|\}\}/g, '')))];

            // Маппинг переменных к названиям
            const varLabels = {
                'domain': 'Домен',
                'oldSub': 'Старый поддомен',
                'newSub': 'Новый поддомен',
                'alternateDomain': 'Домен подмены',
                'hreflangCode': 'hreflang код',
                'redirect': 'Редирект (301/404)',
                'redirect301': '301 редирект',
                'redirect404': '404 ошибка',
                'priority': 'Приоритет',
                'cms': 'CMS',
                'notes': 'Примечания',
                'assignee': 'Ответственный',
                'dmca': 'DMCA',
                'amp': 'AMP',
                'subtasks': 'Подзадачи'
            };

            // Вспомогательные поля (не проверяются при генерации)
            const auxiliaryFields = ['redirect301', 'redirect404', 'redirect', 'dmca', 'amp', 'assignee', 'subtasks', 'priority', 'cms', 'notes'];

            // Разделяем переменные на проверяемые и вспомогательные
            const checkedVars = usedVars.filter(v => !auxiliaryFields.includes(v));
            const auxVars = usedVars.filter(v => auxiliaryFields.includes(v));

            // Генерируем теги используемых переменных
            let usedVarsHtml = '';
            if (checkedVars.length > 0) {
                usedVarsHtml = checkedVars.map(v => `<span class="used-var-tag checked">{{${v}}} <small>${varLabels[v] || v}</small></span>`).join(' ');
            }
            if (auxVars.length > 0) {
                if (usedVarsHtml) usedVarsHtml += '<br><small style="color:#999;margin:4px 0;display:block;">Вспомогательные (не проверяются):</small>';
                usedVarsHtml += auxVars.map(v => `<span class="used-var-tag auxiliary">{{${v}}} <small>${varLabels[v] || v}</small></span>`).join(' ');
            }
            if (!usedVarsHtml) {
                usedVarsHtml = '<span class="no-vars">Нет переменных в шаблоне</span>';
            }

            // Доступные переменные из полей
            const availableVars = Object.entries(allFields)
                .map(([id, f]) => {
                    const isUsed = usedVars.includes(id);
                    return `<code class="${isUsed ? 'var-used' : ''}">${f.variable || '{{' + id + '}}'}</code>`;
                })
                .join(' ');

            // Дополнительные переменные (не в FIELD_REGISTRY)
            const extraVars = [
                { var: '{{hreflangCode}}', label: 'hreflang код' },
                { var: '{{redirect}}', label: '301/404' },
                { var: '{{redirect301}}', label: 'Да/Нет' },
                { var: '{{redirect404}}', label: 'Да/Нет' },
                { var: '{{subtasks}}', label: 'список' }
            ];
            const extraVarsHtml = extraVars.map(v => {
                const varName = v.var.replace(/\{\{|\}\}/g, '');
                const isUsed = usedVars.includes(varName);
                return `<code class="${isUsed ? 'var-used' : ''}">${v.var}</code>`;
            }).join(' ');

            container.innerHTML = `
                <div class="type-selector-row">
                    <div class="type-selector">
                        <label>Тип задачи:</label>
                        <select id="type-select">${typesOptions}</select>
                    </div>
                    <div class="type-actions">
                        <button class="type-edit-btn" id="edit-type-btn" title="Редактировать название">✏️</button>
                        ${!isBuiltInType ? `<button class="type-delete-btn" id="delete-type-btn" title="Удалить тип">🗑️</button>` : ''}
                        <button class="type-add-btn" id="add-type-btn" title="Добавить новый тип">➕ Новый тип</button>
                    </div>
                </div>

                <div class="type-name-display">
                    <span class="type-icon-large">${taskType?.icon || '📋'}</span>
                    <span class="type-name-large">${taskType?.name || 'Без названия'}</span>
                    ${!isBuiltInType ? '<span class="type-custom-badge">свой</span>' : ''}
                </div>

                <div class="template-section">
                    <label>Шаблон ТЗ:</label>
                    <textarea class="template-textarea" id="type-template">${taskType?.tzTemplate || ''}</textarea>

                    <div class="used-vars-section">
                        <b>📋 Переменные в шаблоне:</b>
                        <div class="used-vars-list">${usedVarsHtml}</div>
                        <small class="used-vars-hint">Зелёные — проверяются при генерации ТЗ. Серые — вспомогательные (записываются при включении).</small>
                    </div>

                    <div class="template-variables">
                        <b>Все доступные переменные:</b><br>
                        <span style="font-size:11px;color:#666;">Поля:</span> ${availableVars}<br>
                        <span style="font-size:11px;color:#666;">Доп:</span> ${extraVarsHtml}
                    </div>
                </div>
            `;

            // Обработчик смены типа
            this.shadowRoot.getElementById('type-select').addEventListener('change', (e) => {
                this.saveCurrentTypeSettings();
                this.currentTypeId = e.target.value;
                this.renderTypesTab();
            });

            // Кнопка редактирования
            this.shadowRoot.getElementById('edit-type-btn')?.addEventListener('click', () => this.editTaskType());

            // Кнопка удаления
            this.shadowRoot.getElementById('delete-type-btn')?.addEventListener('click', () => this.deleteTaskType());

            // Кнопка добавления
            this.shadowRoot.getElementById('add-type-btn')?.addEventListener('click', () => this.addTaskType());

            // Блокируем всплытие для textarea
            const textarea = this.shadowRoot.getElementById('type-template');
            ['keydown', 'keyup', 'input'].forEach(evt => {
                textarea.addEventListener(evt, e => e.stopPropagation());
            });
        }

        // Редактирование типа задачи
        editTaskType() {
            const taskType = this.taskTypes[this.currentTypeId];
            if (!taskType) return;

            const newIcon = prompt('Иконка (эмодзи):', taskType.icon || '📋');
            if (newIcon === null) return;

            const newName = prompt('Название типа задачи:', taskType.name);
            if (newName === null || !newName.trim()) return;

            taskType.icon = newIcon;
            taskType.name = newName.trim();

            this.renderTypesTab();
        }

        // Удаление типа задачи
        deleteTaskType() {
            const taskType = this.taskTypes[this.currentTypeId];
            if (!taskType) return;

            if (!confirm('Удалить тип задачи "' + taskType.name + '"?\n\nЭто действие нельзя отменить.')) return;

            delete this.taskTypes[this.currentTypeId];

            // Переключаемся на первый доступный тип
            const remainingTypes = Object.keys(this.taskTypes);
            this.currentTypeId = remainingTypes[0] || 'subdomain';

            this.renderTypesTab();
        }

        // Добавление нового типа задачи
        addTaskType() {
            const icon = prompt('Иконка для нового типа (эмодзи):', '📋');
            if (icon === null) return;

            const name = prompt('Название нового типа задачи:');
            if (!name || !name.trim()) {
                showToast('Название не может быть пустым');
                return;
            }

            // Генерируем ID из названия
            const id = name.trim().toLowerCase()
                .replace(/[^a-zа-яё0-9]/gi, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .substring(0, 20);

            // Проверяем уникальность
            if (this.taskTypes[id]) {
                showToast('Тип с таким ID уже существует');
                return;
            }

            // Создаём новый тип с базовыми полями
            this.taskTypes[id] = {
                id: id,
                name: name.trim(),
                icon: icon || '📋',
                fields: [
                    { fieldId: 'taskName', enabled: true, required: true },
                    { fieldId: 'department', enabled: true, required: true },
                    { fieldId: 'domain', enabled: true, required: true }
                ],
                tzTemplate: `Техническое задание: ${name.trim()}

1) Описание задачи...

2) Шаги выполнения...

Домен: https://{{domain}}/`
            };

            this.currentTypeId = id;
            this.renderTypesTab();

            showToast(' Тип задачи "' + name + '" создан!\n\nНастройте поля и шаблон ТЗ.');
        }

        saveCurrentTypeSettings() {
            if (!this.taskTypes[this.currentTypeId]) return;

            // Сохраняем настройки полей для текущего типа
            const fields = [];
            this.shadowRoot.querySelectorAll('#types-content .type-field-item input[type="checkbox"]').forEach(cb => {
                fields.push({
                    fieldId: cb.dataset.fieldId,
                    enabled: cb.checked,
                    required: false
                });
            });

            const template = this.shadowRoot.getElementById('type-template')?.value || '';

            this.taskTypes[this.currentTypeId].fields = fields;
            this.taskTypes[this.currentTypeId].tzTemplate = template;
        }

        save() {
            // Сохраняем aliases и custom fields из this.fieldSettings
            console.log('Saving fieldSettings:', this.fieldSettings);
            saveFieldSettings(this.fieldSettings);

            // Сохраняем настройки типа задачи
            this.saveCurrentTypeSettings();
            saveTaskTypes(this.taskTypes);

            console.log('Settings saved to localStorage');
            showToast(' Настройки сохранены!');
            this.close();
            this.onUpdate();
        }

        reset() {
            if (!confirm('Сбросить ВСЕ настройки к значениям по умолчанию?\n\nЭто удалит пользовательские aliases и настройки типов задач.')) return;

            localStorage.removeItem(FIELD_SETTINGS_KEY);
            localStorage.removeItem(TASK_TYPES_KEY);

            this.fieldSettings = {};
            this.taskTypes = loadTaskTypes();

            this.switchTab(this.currentTab);

            showToast(' Настройки сброшены к значениям по умолчанию.');
        }

        close() {
            if (this.modalHost) {
                this.modalHost.remove();
            }
        }
    }

    // ===== КЛАСС ДЛЯ МОДАЛЬНОГО ОКНА ВЫБОРА ДОМЕНОВ =====
    class SubtaskTemplatesModal {
        constructor(parentShadowRoot, onApply, dashboardTasks = null) {
            this.parentShadowRoot = parentShadowRoot;
            this.onApply = onApply;
            this.dashboardTasks = dashboardTasks; // v4.5.2: ссылка на tasks Dashboard для динамического добавления pinned
            this.modalHost = null;
            this.shadowRoot = null;
            this.templates = loadSubtaskTemplates();
            this.selectedTemplates = {}; // Теперь объект: { 'SEO': [0, 2], 'DEV': [1] }
            this.currentDepartment = Object.keys(this.templates)[0] || 'SEO';
            this.editingTemplate = null;
            this.teamMembers = null;
        }

        async show() {
            // Загружаем пользователей
            await this.loadTeamMembers();

            this.modalHost = document.createElement('div');
            this.modalHost.id = 'subtask-templates-modal-shadow-host';
            document.body.appendChild(this.modalHost);

            this.shadowRoot = this.modalHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(this.shadowRoot);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES;
            this.shadowRoot.appendChild(styleSheet);

            const modal = document.createElement('div');
            modal.className = 'templates-modal-overlay';
            modal.innerHTML = this.getHTML();
            this.shadowRoot.appendChild(modal);

            this.attachEventListeners();
            this.renderTemplates();
        }

        async loadTeamMembers() {
            if (this.teamMembers) return this.teamMembers;

            // Сначала из кеша
            const cache = loadTeamMembersFromCache();
            if (cache.data && cache.data.length > 0) {
                this.teamMembers = cache.data;
                if (isTeamMembersCacheExpired()) {
                    fetchTeamMembersFromAPI().then(members => { this.teamMembers = members; });
                }
                return this.teamMembers;
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://app.asana.com/api/1.0/workspaces/${CONFIG.asana.workspaceGid}/users`,
                    headers: {
                        'Authorization': `Bearer ${CONFIG.asana.token}`
                    },
                    onload: (response) => {
                        if (response.status === 200) {
                            const result = JSON.parse(response.responseText);
                            this.teamMembers = result.data;
                            saveTeamMembersToCache(result.data);
                            resolve(result.data);
                        } else {
                            reject(new Error('Failed to load team members'));
                        }
                    },
                    onerror: () => reject(new Error('Network error'))
                });
            });
        }

        getHTML() {
            const departments = Object.keys(this.templates);

            // v4.5.2: Собираем все закреплённые подзадачи из всех отделов
            const pinnedSubtasks = [];
            Object.entries(this.templates).forEach(([dept, subtasks]) => {
                if (Array.isArray(subtasks)) {
                    subtasks.forEach((s, idx) => {
                        if (s.pinned) {
                            pinnedSubtasks.push({ ...s, department: dept, index: idx });
                        }
                    });
                }
            });

            return `
                <div class="templates-modal-content">
                    <div class="templates-modal-header">
                        <h3 class="templates-modal-title">📚 Типовые подзадачи</h3>
                        <button class="templates-close-btn" id="close-templates-modal">&times;</button>
                    </div>

                    <!-- v4.5.2: Секция закреплённых подзадач -->
                    <div class="pinned-subtasks-section">
                        <div class="pinned-subtasks-header">
                            <span>📌 Закреплённые подзадачи</span>
                            <span class="pinned-subtasks-hint">(добавляются автоматически)</span>
                        </div>
                        <div class="pinned-subtasks-list">
                            ${pinnedSubtasks.length === 0
                                ? '<div class="pinned-subtasks-empty">Нет закреплённых подзадач</div>'
                                : pinnedSubtasks.map(s => {
                                    const meta = [];
                                    if (s.priority) meta.push(s.priority);
                                    if (s.allocation) meta.push(s.allocation + '%');
                                    const metaStr = meta.length > 0 ? ' | ' + meta.join(' | ') : '';
                                    return `<div class="pinned-subtask-item">
                                        <span class="pinned-subtask-name">${s.name}${metaStr}</span>
                                        <span class="pinned-subtask-dept">${s.department}</span>
                                        <button class="pinned-subtask-unpin" data-dept="${s.department}" data-index="${s.index}" title="Открепить">✖</button>
                                    </div>`;
                                }).join('')
                            }
                        </div>
                    </div>

                    <div class="department-management">
                        <input type="text"
                               class="department-add-input"
                               id="new-department-name"
                               placeholder="Название нового отдела"
                        />
                        <button class="department-add-btn" id="add-department">
                            ➕ Добавить отдел
                        </button>
                    </div>

                    <div class="templates-tabs">
                        ${departments.map(dept => {
                            const selectedCount = this.selectedTemplates[dept] ? this.selectedTemplates[dept].length : 0;
                            return `
                                <button class="templates-tab ${dept === this.currentDepartment ? 'active' : ''}"
                                        data-department="${dept}">
                                    ${dept}
                                    ${selectedCount > 0 ? `<span class="tab-badge">${selectedCount}</span>` : ''}
                                    ${departments.length > 1 ? `<span class="department-delete-btn" data-department="${dept}">✖</span>` : ''}
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <div id="templates-content"></div>

                    <div class="templates-modal-footer">
                        <div class="templates-select-info">
                            Выбрано: <strong id="selected-count">0</strong>
                        </div>
                        <button class="templates-apply-btn" id="apply-templates" disabled>
                            Добавить выбранные
                        </button>
                    </div>
                </div>
            `;
        }

        attachEventListeners() {
            this.shadowRoot.getElementById('close-templates-modal').addEventListener('click', () => this.close());
            this.shadowRoot.getElementById('apply-templates').addEventListener('click', () => this.applyTemplates());

            // Добавление нового отдела
            this.shadowRoot.getElementById('add-department').addEventListener('click', () => this.addDepartment());

            // v4.5.2: Открепление из секции закреплённых
            this.shadowRoot.querySelectorAll('.pinned-subtask-unpin').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dept = btn.dataset.dept;
                    const index = parseInt(btn.dataset.index);
                    if (this.templates[dept] && this.templates[dept][index]) {
                        this.templates[dept][index].pinned = false;
                        saveSubtaskTemplates(this.templates);
                        this.updateUI();
                    }
                });
            });

            // Переключение между отделами
            this.shadowRoot.querySelectorAll('.templates-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('department-delete-btn')) {
                        this.currentDepartment = e.target.dataset.department;
                        this.updateUI(); // Не очищаем selectedTemplates
                    }
                });
            });

            // Удаление отдела
            this.shadowRoot.querySelectorAll('.department-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteDepartment(btn.dataset.department);  // v4.3.7: btn вместо e.target
                });
            });

            // Закрытие по клику на overlay
            this.shadowRoot.querySelector('.templates-modal-overlay').addEventListener('click', (e) => {
                if (e.target.classList.contains('templates-modal-overlay')) {
                    this.close();
                }
            });
        }

        renderTemplates() {
            const container = this.shadowRoot.getElementById('templates-content');
            const deptTemplates = this.templates[this.currentDepartment] || [];
            const currentSelection = this.selectedTemplates[this.currentDepartment] || [];

            const getUserName = (gid) => {
                if (!gid || !this.teamMembers) return 'Не выбрано';
                const user = this.teamMembers.find(u => u.gid === gid);
                return user ? user.name : 'Не выбрано';
            };

            let html = `
                <div class="templates-department-content active">
                    ${deptTemplates.map((template, index) => {
                        // v4.5.2: Собираем только заполненные метаданные
                        const meta = [];
                        if (template.priority) meta.push(`Priority: ${template.priority}`);
                        if (template.allocation) meta.push(`${template.allocation}%`);
                        if (template.assignee) meta.push(`Ответственный: ${getUserName(template.assignee)}`);
                        if (template.pinned) meta.push('<span style="color:#4CAF50;">Авто</span>');
                        const metaStr = meta.length > 0 ? meta.join(' | ') : '<span style="color:#999;">Без параметров</span>';

                        return `
                        <div class="template-item">
                            <input type="checkbox"
                                   class="template-checkbox"
                                   data-index="${index}"
                                   ${currentSelection.includes(index) ? 'checked' : ''}
                            />
                            <div class="template-item-info">
                                <div class="template-item-name">${template.pinned ? '📌 ' : ''}${template.name}</div>
                                <div class="template-item-meta">${metaStr}</div>
                            </div>
                            <div class="template-item-actions">
                                <button class="template-pin-btn ${template.pinned ? 'pinned' : ''}" data-index="${index}" title="${template.pinned ? 'Открепить' : 'Закрепить (авто-добавление)'}">📌</button>
                                <button class="template-edit-btn" data-index="${index}">✏️</button>
                                <button class="template-delete-btn" data-index="${index}">🗑️</button>
                            </div>
                        </div>
                    `}).join('')}

                    <div class="template-add-form" id="add-template-form" style="display: none;">
                        <div class="template-add-title">
                            ${this.editingTemplate !== null ? '✏️ Редактировать подзадачу' : '➕ Добавить новую подзадачу'}
                        </div>
                        <div class="template-form-row">
                            <input type="text"
                                   class="template-form-input"
                                   id="new-template-name"
                                   placeholder="Название подзадачи"
                            />
                            <select class="template-form-select" id="new-template-priority">
                                <option value="">— Приоритет —</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <input type="number"
                                   class="template-form-input"
                                   id="new-template-allocation"
                                   placeholder="—"
                                   min="0"
                                   max="100"
                                   value=""
                            />
                        </div>
                        <div class="template-assignee-row">
                            <label class="template-assignee-label">Ответственный (опционально)</label>
                            <select class="template-assignee-select" id="new-template-assignee">
                                <option value="">Не выбрано</option>
                                ${this.teamMembers ? this.teamMembers.map(member => `
                                    <option value="${member.gid}">${member.name}</option>
                                `).join('') : ''}
                            </select>
                        </div>
                        <div class="template-form-buttons">
                            <button class="template-save-btn" id="save-new-template">
                                ${this.editingTemplate !== null ? 'Сохранить' : 'Добавить'}
                            </button>
                            <button class="template-cancel-btn" id="cancel-new-template">Отмена</button>
                        </div>
                    </div>

                    <button class="add-subtask-btn" id="show-add-form" style="margin-top: 16px;">
                        ➕ Добавить шаблон
                    </button>
                </div>
            `;

            container.innerHTML = html;

            // Добавляем обработчики для новых элементов
            this.attachTemplateEventListeners();
        }

        attachTemplateEventListeners() {
            // Чекбоксы выбора
            this.shadowRoot.querySelectorAll('.template-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const index = parseInt(e.target.dataset.index);

                    // Инициализируем массив для текущего отдела если его нет
                    if (!this.selectedTemplates[this.currentDepartment]) {
                        this.selectedTemplates[this.currentDepartment] = [];
                    }

                    if (e.target.checked) {
                        if (!this.selectedTemplates[this.currentDepartment].includes(index)) {
                            this.selectedTemplates[this.currentDepartment].push(index);
                        }
                    } else {
                        this.selectedTemplates[this.currentDepartment] =
                            this.selectedTemplates[this.currentDepartment].filter(i => i !== index);
                    }
                    this.updateSelectedCount();
                });
            });

            // Кнопки редактирования
            this.shadowRoot.querySelectorAll('.template-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);  // v4.3.7: btn вместо e.target
                    this.editTemplate(index);
                });
            });

            // v4.5.2: Кнопки закрепления
            this.shadowRoot.querySelectorAll('.template-pin-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);
                    this.togglePinTemplate(index);
                });
            });

            // Кнопки удаления
            this.shadowRoot.querySelectorAll('.template-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);  // v4.3.7: btn вместо e.target
                    this.deleteTemplate(index);
                });
            });

            // Показать форму добавления
            const showFormBtn = this.shadowRoot.getElementById('show-add-form');
            if (showFormBtn) {
                showFormBtn.addEventListener('click', () => {
                    this.editingTemplate = null;
                    this.shadowRoot.getElementById('add-template-form').style.display = 'block';
                    this.shadowRoot.getElementById('new-template-name').value = '';
                    this.shadowRoot.getElementById('new-template-priority').value = '';
                    this.shadowRoot.getElementById('new-template-allocation').value = '';
                    this.shadowRoot.getElementById('new-template-assignee').value = '';
                });
            }

            // Предотвращаем всплытие событий для полей формы
            // ===== FIX: Расширенный stopPropagation для всех полей =====
            ['new-template-name', 'new-template-priority', 'new-template-allocation', 'new-template-assignee', 'new-department-name'].forEach(id => {
                const el = this.shadowRoot.getElementById(id);
                if (el) {
                    el.addEventListener('keydown', (e) => e.stopPropagation());
                    el.addEventListener('keyup', (e) => e.stopPropagation());
                    el.addEventListener('keypress', (e) => e.stopPropagation());
                    el.addEventListener('input', (e) => e.stopPropagation());
                    el.addEventListener('focus', (e) => e.stopPropagation());
                }
            });

            // Сохранить новый/отредактированный шаблон
            const saveBtn = this.shadowRoot.getElementById('save-new-template');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveNewTemplate());
            }

            // Отмена
            const cancelBtn = this.shadowRoot.getElementById('cancel-new-template');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    this.shadowRoot.getElementById('add-template-form').style.display = 'none';
                    this.editingTemplate = null;
                });
            }
        }

        addDepartment() {
            const input = this.shadowRoot.getElementById('new-department-name');
            const name = input.value.trim();

            if (!name) {
                showToast('Введите название отдела');
                return;
            }

            if (this.templates[name]) {
                showToast('Отдел с таким названием уже существует');
                return;
            }

            this.templates[name] = [];
            saveSubtaskTemplates(this.templates);
            this.currentDepartment = name;
            input.value = '';

            // Перерендерим всё модальное окно
            this.shadowRoot.querySelector('.templates-modal-overlay').innerHTML = '';
            const modal = this.shadowRoot.querySelector('.templates-modal-overlay');
            modal.innerHTML = this.getHTML();
            this.attachEventListeners();
            this.renderTemplates();
        }

        deleteDepartment(deptName) {
            const departments = Object.keys(this.templates);

            if (departments.length <= 1) {
                showToast('Нельзя удалить последний отдел');
                return;
            }

            if (confirm(`Удалить отдел "${deptName}" и все его шаблоны?`)) {
                delete this.templates[deptName];
                delete this.selectedTemplates[deptName]; // Удаляем выборы этого отдела
                saveSubtaskTemplates(this.templates);

                // Переключаемся на первый доступный отдел
                this.currentDepartment = Object.keys(this.templates)[0];

                // Перерендерим всё модальное окно
                this.shadowRoot.querySelector('.templates-modal-overlay').innerHTML = '';
                const modal = this.shadowRoot.querySelector('.templates-modal-overlay');
                modal.innerHTML = this.getHTML();
                this.attachEventListeners();
                this.renderTemplates();
            }
        }

        editTemplate(index) {
            this.editingTemplate = index;
            const template = this.templates[this.currentDepartment][index];

            this.shadowRoot.getElementById('add-template-form').style.display = 'block';
            this.shadowRoot.getElementById('new-template-name').value = template.name;
            this.shadowRoot.getElementById('new-template-priority').value = template.priority;
            this.shadowRoot.getElementById('new-template-allocation').value = template.allocation;
            this.shadowRoot.getElementById('new-template-assignee').value = template.assignee || '';
        }

        deleteTemplate(index) {
            if (confirm('Удалить этот шаблон?')) {
                this.templates[this.currentDepartment].splice(index, 1);
                saveSubtaskTemplates(this.templates);
                this.renderTemplates();
            }
        }

        // v4.5.2: Закрепить/открепить подзадачу
        togglePinTemplate(index) {
            const template = this.templates[this.currentDepartment][index];
            if (template) {
                template.pinned = !template.pinned;
                saveSubtaskTemplates(this.templates);

                // v4.5.2: Динамическое добавление/удаление подзадачи во все текущие задачи
                const dashboardTasks = this.dashboardTasks || (typeof window._seoAutomationGetTasks === 'function' ? window._seoAutomationGetTasks() : null);

                if (dashboardTasks && Array.isArray(dashboardTasks) && dashboardTasks.length > 0) {
                    if (template.pinned) {
                        // Добавляем подзадачу ко всем задачам где её ещё нет
                        dashboardTasks.forEach(task => {
                            if (!task.subtasks) task.subtasks = [];
                            const exists = task.subtasks.some(s => s.name === template.name);
                            if (!exists) {
                                task.subtasks.push({
                                    name: template.name,
                                    priority: template.priority || 'medium',
                                    allocation: template.allocation || 1,
                                    assignee: template.assignee || ''
                                });
                            }
                        });
                        showToast(`📌 "${template.name}" добавлена ко всем ${dashboardTasks.length} задачам`, 'success');
                    } else {
                        // Удаляем подзадачу из всех задач
                        dashboardTasks.forEach(task => {
                            if (task.subtasks) {
                                task.subtasks = task.subtasks.filter(s => s.name !== template.name);
                            }
                        });
                        showToast(`📌 "${template.name}" откреплена`, 'info');
                    }
                }

                this.updateUI();  // v4.5.2: updateUI вместо renderTemplates для обновления секции закреплённых
            }
        }

        saveNewTemplate() {
            const name = this.shadowRoot.getElementById('new-template-name').value.trim();
            const priority = this.shadowRoot.getElementById('new-template-priority').value;
            const allocationVal = this.shadowRoot.getElementById('new-template-allocation').value;
            const allocation = allocationVal ? parseInt(allocationVal) : null;  // v4.5.2: может быть пустым
            const assignee = this.shadowRoot.getElementById('new-template-assignee').value;

            if (!name) {
                showToast('Введите название подзадачи');
                return;
            }

            const newTemplate = { name, priority, allocation, assignee };

            if (this.editingTemplate !== null) {
                // Редактирование
                this.templates[this.currentDepartment][this.editingTemplate] = newTemplate;
            } else {
                // Добавление
                if (!this.templates[this.currentDepartment]) {
                    this.templates[this.currentDepartment] = [];
                }
                this.templates[this.currentDepartment].push(newTemplate);
            }

            saveSubtaskTemplates(this.templates);
            this.shadowRoot.getElementById('add-template-form').style.display = 'none';
            this.editingTemplate = null;
            this.renderTemplates();
        }

        updateUI() {
            // Перерендерим всё модальное окно чтобы обновить бейджи на вкладках
            this.shadowRoot.querySelector('.templates-modal-overlay').innerHTML = '';
            const modal = this.shadowRoot.querySelector('.templates-modal-overlay');
            modal.innerHTML = this.getHTML();
            this.attachEventListeners();
            this.renderTemplates();
            this.updateSelectedCount();
        }

        updateSelectedCount() {
            // Подсчитываем общее количество выбранных подзадач из всех отделов
            let totalCount = 0;
            for (const dept in this.selectedTemplates) {
                totalCount += this.selectedTemplates[dept].length;
            }

            this.shadowRoot.getElementById('selected-count').textContent = totalCount;
            this.shadowRoot.getElementById('apply-templates').disabled = totalCount === 0;
        }

        applyTemplates() {
            const allSelected = [];

            // Собираем все выбранные шаблоны из всех отделов
            for (const dept in this.selectedTemplates) {
                const indices = this.selectedTemplates[dept];
                indices.forEach(index => {
                    const template = this.templates[dept][index];
                    if (template) {
                        allSelected.push({
                            name: template.name,
                            priority: template.priority,
                            allocation: template.allocation,
                            assignee: template.assignee || ''
                        });
                    }
                });
            }

            this.onApply(allSelected);
            this.close();
        }

        close() {
            if (this.modalHost) {
                this.modalHost.remove();
            }
        }
    }

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    function init() {
        if(DEBUG) console.log('🚀 Инициализация скрипта v4.5.3...');
        if(DEBUG) console.log('📍 URL:', window.location.href);
        if(DEBUG) console.log('📍 readyState:', document.readyState);

        initializeStorage();
        if(DEBUG) console.log('✓ Хранилище инициализировано');

        // v4.5.3: Проверка авторизации при первом запуске
        if (!isCloudAuthSet()) {
            if(DEBUG) console.log('🔐 Первый запуск - показываем настройку авторизации');
            showInitialAuthSetup(() => {
                if(DEBUG) console.log('✓ Авторизация настроена, продолжаем инициализацию');
                continueInit();
            });
        } else {
            continueInit();
        }
    }

    function continueInit() {
        // Глобальная ссылка на dashboard
        let dashboardInstance = null;

        // v4.5.2: Глобальная функция для доступа к tasks Dashboard
        window._seoAutomationGetTasks = () => dashboardInstance ? dashboardInstance.tasks : null;

        // Функция создания кнопки триггера
        function createTriggerButton() {
            // Проверяем, что body существует и кнопка ещё не создана
            if (!document.body) {
                if(DEBUG) console.log('⏳ Body не готов, ожидаем...');
                setTimeout(createTriggerButton, 100);
                return;
            }

            if (document.getElementById('subdomain-trigger-shadow-host')) {
                if(DEBUG) console.log('✓ Кнопка триггера уже существует');
                return;
            }

            const triggerHost = document.createElement('div');
            triggerHost.id = 'subdomain-trigger-shadow-host';
            document.body.appendChild(triggerHost);

            const triggerShadow = triggerHost.attachShadow({ mode: 'open' });
            preventKeyboardEventBubbling(triggerShadow);

            const styleSheet = document.createElement('style');
            styleSheet.textContent = ISOLATED_STYLES;
            triggerShadow.appendChild(styleSheet);

            const triggerButton = document.createElement('button');
            triggerButton.className = 'trigger-button';
            triggerButton.textContent = '🔧 Смена поддоменов';
            triggerButton.addEventListener('click', () => {
                // Если dashboard не существует - создаём
                if (!dashboardInstance || !document.getElementById('subdomain-automation-shadow-host')) {
                    dashboardInstance = new SubdomainDashboard();
                    dashboardInstance.create();
                } else {
                    // Если существует - toggle (показать/скрыть)
                    dashboardInstance.toggle();
                }
            });

            triggerShadow.appendChild(triggerButton);

            if(DEBUG) console.log('✅ SEO Subdomain Automation Suite v4.0 активирован');
            if(DEBUG) console.log('✓ Кнопка триггера создана и добавлена в DOM');
            if(DEBUG) console.log('📋 Конфигурация:');
            if(DEBUG) console.log('   - Workspace:', CONFIG.asana.workspaceGid);
            if(DEBUG) console.log('   - Project AI.test:', CONFIG.asana.projects['AI.test']);
        }

        createTriggerButton();

        // v4.3.7: Синхронизация маппинга Asana → Rocket.Chat при старте
        setTimeout(() => syncAsanaRocketMapping(), 1000);

        // Фоновое обновление кешей (1 раз в день)
        if (isTeamMembersCacheExpired()) {
            setTimeout(() => refreshTeamMembersCacheInBackground(), 2000);
        }
        if (isRocketUsersCacheExpired()) {
            setTimeout(() => refreshRocketUsersCacheInBackground(), 3000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
