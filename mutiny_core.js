// ================================
// MUTINY.PW CORE MODULE
// ================================
(function() {
    'use strict';

    // Глобальный неймспейс MUTINY
    window.MUTINY = {
        version: '1.0',
        config: {
            universal: true,
            uiToggleKey: 45, // INSERT
            safetyDelay: 100
        }
    };

    // ================================
    // UTILS MODULE (переработанный)
    // ================================
    class MutinyUtils {
        constructor() {
            this.cache = {};
        }

        getRootElement() {
            if (this.cache.rootElement) return this.cache.rootElement;
            const root = document.getElementById('root');
            return this.cache.rootElement = root ? root._reactRootContainer || root : null;
        }

        getRootObject() {
            if (this.cache.rootObject) return this.cache.rootObject;
            const root = this.getRootElement();
            if (!root || !root._internalRoot) return null;
            return this.cache.rootObject = root._internalRoot.current?.memoizedState?.element?.type?.prototype;
        }

        isGameReady() {
            // Универсальная проверка для всех серверов
            const rootObj = this.getRootObject();
            if (!rootObj) return false;
            return !!rootObj.store?.state?.game || !!rootObj.store?.state?.battleStatistics;
        }

        isNotOpenChat() {
            return !document.querySelector('.chat-input, .chat-open');
        }

        errorLog(msg) {
            console.log(`[MUTINY] ${msg}`);
        }

        // Новая: универсальный поиск игровых объектов
        deepSearch(obj, targetKey, maxDepth = 5) {
            const stack = [{ obj, depth: 0 }];
            while (stack.length) {
                const { obj, depth } = stack.pop();
                if (depth > maxDepth) continue;
                if (obj && typeof obj === 'object') {
                    if (obj.hasOwnProperty(targetKey)) return obj[targetKey];
                    for (const key in obj) {
                        stack.push({ obj: obj[key], depth: depth + 1 });
                    }
                }
            }
            return null;
        }
    }

    // ================================
    // GAME OBJECTS MODULE (оптимизированный)
    // ================================
    class MutinyGameObjects {
        constructor() {
            this.utils = new MutinyUtils();
            this.cache = {};
        }

        getWorld() {
            if (this.cache.world) return this.cache.world;
            const localPlayer = this.getLocalPlayer();
            if (!localPlayer) return null;
            return this.cache.world = localPlayer[0]?.world || this.utils.deepSearch(localPlayer, 'world');
        }

        getLocalPlayer() {
            if (this.cache.localPlayer) return this.cache.localPlayer;
            const rootObj = this.utils.getRootObject();
            if (!rootObj?.store?.subscribers) return null;
            
            const subs = rootObj.store.subscribers.array_hd7ov6$_0 || 
                        this.utils.deepSearch(rootObj.store, 'subscribers');
            
            for (let sub of subs) {
                if (sub?.tank?.tag === 'LocalTank') {
                    return this.cache.localPlayer = sub.tank.components_0?.array || 
                                                    this.utils.deepSearch(sub.tank, 'components');
                }
            }
            return null;
        }

        // Универсальные геттеры
        getComponent(typePattern) {
            const player = this.getLocalPlayer();
            if (!player) return null;
            
            for (let comp of player) {
                for (let key in comp) {
                    if (key.toLowerCase().includes(typePattern.toLowerCase())) {
                        return comp[key];
                    }
                }
            }
            return null;
        }

        getPhysics() { return this.getComponent('physics') || this.cache.physics; }
        getWeapon() { return this.getComponent('weapon') || this.getComponent('striker'); }
        getHealth() { return this.getComponent('health') || this.getComponent('damageable'); }
        getCamera() { return this.getComponent('camera') || this.getComponent('followcamera'); }
    }

    // ================================
    // FEATURES MODULE
    // ================================
    const MutinyFeatures = {
        // FLIGHT (бывший AirBreak)
        flight: {
            active: false,
            speed: 250,
            antiAim: false,
            position: { x: 0, y: 0, z: 0 },
            
            toggle() {
                this.active = !this.active;
                if (this.active) {
                    const physics = MUTINY.game.getPhysics();
                    if (physics) {
                        this.position.x = physics.body?.state?.position?.x || 0;
                        this.position.y = physics.body?.state?.position?.y || 0;
                        this.position.z = physics.body?.state?.position?.z || 0;
                    }
                }
                MUTINY.ui.updateState('flight', this.active);
            },

            process() {
                if (!this.active) return;
                const physics = MUTINY.game.getPhysics();
                const camera = MUTINY.game.getCamera();
                if (!physics || !camera) return;

                // Улучшенное управление с учетом коллизий
                const dir = camera.direction || 0;
                const moveSpeed = this.speed * 0.1;

                if (MUTINY.keys.isPressed(87)) { // W
                    this.position.x += Math.sin(-dir) * moveSpeed;
                    this.position.y += Math.cos(-dir) * moveSpeed;
                }
                if (MUTINY.keys.isPressed(83)) { // S
                    this.position.x -= Math.sin(-dir) * moveSpeed;
                    this.position.y -= Math.cos(-dir) * moveSpeed;
                }
                if (MUTINY.keys.isPressed(81)) this.position.z += moveSpeed; // Q
                if (MUTINY.keys.isPressed(69)) this.position.z -= moveSpeed; // E

                // Применение позиции
                if (physics.body?.state) {
                    physics.body.state.position.x = this.position.x;
                    physics.body.state.position.y = this.position.y;
                    physics.body.state.position.z = this.position.z;
                }
            }
        },

        // VISION (WallHack улучшенный)
        vision: {
            active: true,
            colors: { enemy: 0xFF3366, target: 0x33FF99, friend: 0x3399FF },
            
            process() {
                if (!this.active) return;
                const world = MUTINY.game.getWorld();
                if (!world?.physicsScene_0?.bodies_0) return;

                const bodies = world.physicsScene_0.bodies_0.array_hd7ov6$_0;
                const localTeam = MUTINY.game.getLocalPlayer()?.[0]?.team_1h5i78$_0?.name$;

                for (let body of bodies) {
                    const components = body.data?.components_0?.array;
                    if (!components) continue;

                    const teamComp = components.find(c => c.team_1h5i78$_0);
                    if (!teamComp) continue;

                    const isEnemy = teamComp.team_1h5i78$_0.name$ !== localTeam;
                    const skin = components.find(c => c.weaponSkin_3qscef$_0)?.weaponSkin_3qscef$_0;

                    if (skin) {
                        const color = isEnemy ? this.colors.enemy : this.colors.friend;
                        this.applyOutline(skin, color);
                    }
                }
            },

            applyOutline(obj, color) {
                if (!obj) return;
                obj.outlined = true;
                obj.outlineColor = color;
                if (obj.children_ich852$_0) {
                    for (let child of obj.children_ich852$_0.array) {
                        this.applyOutline(child, color);
                    }
                }
            }
        },

        // STRIKER MODIFICATIONS
        striker: {
            modified: false,
            
            init() {
                const weapon = MUTINY.game.getWeapon();
                if (!weapon || this.modified) return;

                // Расширенные углы наведения
                if (weapon.targetingSystem_0) {
                    const calc = weapon.targetingSystem_0.targetingSystem_0?.directionCalculator_0?.targetingSectorsCalculator_0;
                    if (calc) {
                        calc.maxElevationAngle_0 = 99999;
                        calc.minElevationAngle_0 = -99999;
                    }
                }

                // Модификация снарядов
                const player = MUTINY.game.getLocalPlayer();
                if (player) {
                    for (let comp of player) {
                        if (comp.shellCache_0) {
                            this.modifyShells(comp.shellCache_0.itemsInUse_123ot1$_0?.array_hd7ov6$_0);
                            break;
                        }
                    }
                }
                this.modified = true;
            },

            modifyShells(shells) {
                if (!shells) return;
                for (let shell of shells) {
                    const moveComp = shell.components_0?.array?.[1];
                    if (moveComp) {
                        moveComp.maxSpeed_0 = 35000;
                        moveComp.minSpeed_0 = 2000;
                    }
                }
            }
        },

        // AUTO-ACTIONS
        auto: {
            mining: false,
            repair: true,
            supplies: true,

            process() {
                if (!MUTINY.utils.isGameReady()) return;
                
                const gameActions = MUTINY.game.getWorld()?.inputManager?.input?.gameActions_0?.map;
                if (!gameActions) return;

                // Авто-ремонт
                if (this.repair) {
                    const health = MUTINY.game.getHealth();
                    if (health && health.health < health.maxHealth * 0.7) {
                        this.triggerAction(gameActions, 5); // FAK
                    }
                }

                // Авто-мины
                if (this.mining) {
                    this.triggerAction(gameActions, 9);
                }
            },

            triggerAction(actions, index) {
                const action = Array.from(actions)[index];
                if (action) {
                    action[1].wasPressed = true;
                    action[1].wasReleased = true;
                }
            }
        }
    };

    // ================================
    // UI MODULE (полностью переработанный)
    // ================================
    const MutinyUI = {
        init() {
            this.createWindow();
            this.bindKeys();
        },

        createWindow() {
            const style = document.createElement('style');
            style.textContent = `
                .mutiny-container {
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    background: rgba(0, 0, 0, 0.85);
                    border: 2px solid #00ffea;
                    border-radius: 10px;
                    padding: 15px;
                    min-width: 280px;
                    z-index: 99999;
                    font-family: 'Segoe UI', monospace;
                    color: #00ffea;
                    box-shadow: 0 0 25px rgba(0, 255, 234, 0.3);
                    backdrop-filter: blur(10px);
                    user-select: none;
                }
                .mutiny-header {
                    text-align: center;
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: #ff00ff;
                    text-shadow: 0 0 10px #ff00ff;
                }
                .mutiny-feature {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    padding: 5px;
                    border-bottom: 1px solid rgba(0, 255, 234, 0.2);
                }
                .mutiny-state {
                    font-weight: bold;
                }
                .mutiny-on { color: #00ff00; }
                .mutiny-off { color: #ff5555; }
                .mutiny-hotkey {
                    color: #ffaa00;
                    font-size: 12px;
                    margin-left: 10px;
                }
            `;
            document.head.appendChild(style);

            const container = document.createElement('div');
            container.className = 'mutiny-container';
            container.id = 'mutiny-window';
            container.innerHTML = `
                <div class="mutiny-header">MUTINY.PW v1.0</div>
                <div class="mutiny-feature">
                    <span>FLIGHT MODE:</span>
                    <span id="mutiny-state-flight" class="mutiny-state mutiny-off">OFF</span>
                    <span class="mutiny-hotkey">[R.SHIFT]</span>
                </div>
                <div class="mutiny-feature">
                    <span>VISION:</span>
                    <span id="mutiny-state-vision" class="mutiny-state mutiny-on">ON</span>
                </div>
                <div class="mutiny-feature">
                    <span>AUTO-MINE:</span>
                    <span id="mutiny-state-mine" class="mutiny-state mutiny-off">OFF</span>
                    <span class="mutiny-hotkey">[5]</span>
                </div>
                <div class="mutiny-feature">
                    <span>WEAPON MOD:</span>
                    <span id="mutiny-state-weapon" class="mutiny-state mutiny-on">ACTIVE</span>
                </div>
                <div style="margin-top: 15px; font-size: 12px; text-align: center; color: #888;">
                    [INS] Toggle Menu | MUTINY.PW Research Build
                </div>
            `;
            document.body.appendChild(container);
        },

        updateState(feature, active) {
            const element = document.getElementById(`mutiny-state-${feature}`);
            if (element) {
                element.textContent = active ? 'ON' : 'OFF';
                element.className = `mutiny-state ${active ? 'mutiny-on' : 'mutiny-off'}`;
            }
        },

        bindKeys() {
            document.addEventListener('keyup', (e) => {
                if (!MUTINY.utils.isNotOpenChat()) return;
                
                switch(e.keyCode) {
                    case 16: // R.SHIFT
                        MUTINY.features.flight.toggle();
                        break;
                    case 53: // 5
                        MUTINY.features.auto.mining = !MUTINY.features.auto.mining;
                        MUTINY.ui.updateState('mine', MUTINY.features.auto.mining);
                        break;
                    case 45: // INSERT
                        const win = document.getElementById('mutiny-window');
                        win.style.display = win.style.display === 'none' ? 'block' : 'none';
                        break;
                    case 74: // J
                        MUTINY.features.flight.antiAim = !MUTINY.features.flight.antiAim;
                        break;
                }
            });
        }
    };

    // ================================
    // ИНИЦИАЛИЗАЦИЯ СИСТЕМЫ
    // ================================
    const init = () => {
        console.log('[MUTINY.PW] Initializing...');

        // Глобальный экспорт
        window.MUTINY.utils = new MutinyUtils();
        window.MUTINY.game = new MutinyGameObjects();
        window.MUTINY.features = MutinyFeatures;
        window.MUTINY.ui = MutinyUI;
        window.MUTINY.keys = { isPressed: window.isKeyPressed };

        // Инициализация UI
        MUTINY.ui.init();

        // Инициализация функций
        setTimeout(() => {
            MUTINY.features.striker.init();
        }, 3000);

        // Главный цикл
        const mainLoop = () => {
            try {
                if (MUTINY.utils.isGameReady()) {
                    MUTINY.features.flight.process();
                    MUTINY.features.vision.process();
                    MUTINY.features.auto.process();
                }
            } catch (e) {
                MUTINY.utils.errorLog(e);
            }
            requestAnimationFrame(mainLoop);
        };
        mainLoop();

        console.log('[MUTINY.PW] System ready.');
    };

    // Запуск при полной загрузке
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }
})();