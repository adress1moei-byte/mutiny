// ================================
// MUTINY.PW CORE MODULE v1.1
// ================================
(function() {
    'use strict';
    
    // Флаг инициализации
    if (window.MUTINY_INITIALIZED) return;
    window.MUTINY_INITIALIZED = true;
    
    // Глобальный неймспейс
    const MUTINY = {
        version: '1.1',
        debug: true,
        config: {
            uiKey: 45, // INSERT
            hotkeys: {
                flight: 16, // R_SHIFT
                mining: 53, // 5
                antiAim: 74, // J
                menu: 45 // INSERT
            }
        },
        
        // Публичные методы
        init: function() {
            console.log('[MUTINY.PW] Starting initialization...');
            this.setupGlobals();
            this.setupEventListeners();
            this.setupUI();
            this.startMainLoop();
            console.log('[MUTINY.PW] Ready! Press INSERT for menu');
        },
        
        setupGlobals: function() {
            this.utils = new MutinyUtils();
            this.game = new MutinyGameObjects();
            this.features = new MutinyFeatures();
            this.ui = new MutinyUI();
            this.state = {
                menuVisible: true,
                flightActive: false,
                visionActive: true,
                autoMine: false
            };
        },
        
        setupEventListeners: function() {
            // Глобальные горячие клавиши
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                
                switch(e.keyCode) {
                    case this.config.hotkeys.flight:
                        if (e.location === 2) { // Right Shift
                            this.features.flight.toggle();
                            e.preventDefault();
                        }
                        break;
                    case this.config.hotkeys.mining:
                        this.state.autoMine = !this.state.autoMine;
                        this.ui.updateState('mine', this.state.autoMine);
                        break;
                    case this.config.hotkeys.menu:
                        this.ui.toggleMenu();
                        break;
                }
            });
        },
        
        startMainLoop: function() {
            const loop = () => {
                try {
                    if (this.utils.isGameReady()) {
                        this.features.flight.process();
                        this.features.vision.process();
                        this.features.auto.process();
                    }
                } catch (e) {
                    this.utils.error('Loop error:', e);
                }
                requestAnimationFrame(loop);
            };
            loop();
        }
    };
    
    // ================================
    // UTILITIES
    // ================================
    class MutinyUtils {
        constructor() {
            this.cache = {};
        }
        
        isGameReady() {
            // Универсальная проверка
            if (window.GAME_READY) return true;
            
            // Проверка по DOM элементам
            const indicators = [
                '.game-container',
                '.sc-bwzfXH',
                '#root canvas',
                '[class*="game"]',
                '[class*="battle"]'
            ];
            
            for (const selector of indicators) {
                if (document.querySelector(selector)) {
                    window.GAME_READY = true;
                    return true;
                }
            }
            
            // Проверка по глобальным объектам
            if (window.__GAME_INITIALIZED__ || window.gameStore) {
                window.GAME_READY = true;
                return true;
            }
            
            return false;
        }
        
        getRoot() {
            if (this.cache.root) return this.cache.root;
            
            // Поиск React root
            const root = document.getElementById('root');
            if (root && root._reactRootContainer) {
                return this.cache.root = root._reactRootContainer._internalRoot?.current;
            }
            
            // Альтернативный поиск
            const roots = document.querySelectorAll('*[id^="root"], *[class*="root"]');
            for (const elem of roots) {
                if (elem.__reactFiber) {
                    return this.cache.root = elem.__reactFiber;
                }
            }
            
            return null;
        }
        
        findGameStore() {
            const root = this.getRoot();
            if (!root) return null;
            
            // Поиск store в React дереве
            const findStore = (node, depth = 0) => {
                if (depth > 10) return null;
                if (!node) return null;
                
                if (node.stateNode && node.stateNode.store) {
                    return node.stateNode.store;
                }
                
                if (node.memoizedState && node.memoizedState.element) {
                    const store = this.deepFind(node.memoizedState.element, 'store');
                    if (store) return store;
                }
                
                return findStore(node.child, depth + 1) || 
                       findStore(node.sibling, depth + 1);
            };
            
            return findStore(root);
        }
        
        deepFind(obj, key) {
            const stack = [obj];
            const visited = new Set();
            
            while (stack.length) {
                const current = stack.pop();
                if (!current || visited.has(current)) continue;
                visited.add(current);
                
                if (current[key]) return current[key];
                
                for (const k in current) {
                    if (typeof current[k] === 'object') {
                        stack.push(current[k]);
                    }
                }
            }
            return null;
        }
        
        log(...args) {
            if (MUTINY.debug) {
                console.log('[MUTINY]', ...args);
            }
        }
        
        error(...args) {
            console.error('[MUTINY]', ...args);
        }
    }
    
    // ================================
    // GAME OBJECTS
    // ================================
    class MutinyGameObjects {
        constructor() {
            this.utils = new MutinyUtils();
            this.cache = {};
            this.init();
        }
        
        init() {
            // Периодический поиск объектов
            setInterval(() => {
                this.cache = {};
            }, 30000);
        }
        
        getLocalPlayer() {
            if (this.cache.player) return this.cache.player;
            
            const store = this.utils.findGameStore();
            if (!store) return null;
            
            // Поиск через store.state
            const state = store.getState ? store.getState() : store.state;
            if (state && state.game) {
                const players = this.utils.deepFind(state.game, 'players');
                if (players && players.localPlayer) {
                    return this.cache.player = players.localPlayer;
                }
            }
            
            // Альтернативный поиск через subscribers
            const subscribers = this.utils.deepFind(store, 'subscribers');
            if (subscribers && subscribers.array) {
                for (const sub of subscribers.array) {
                    if (sub && sub.tank && sub.tank.tag === 'LocalTank') {
                        return this.cache.player = sub.tank;
                    }
                }
            }
            
            return null;
        }
        
        getWorld() {
            const player = this.getLocalPlayer();
            if (!player) return null;
            
            // Поиск world через компоненты
            const components = player.components || player.components_0;
            if (components && components.array) {
                for (const comp of components.array) {
                    if (comp && comp.world) {
                        return comp.world;
                    }
                }
            }
            
            return this.utils.deepFind(player, 'world');
        }
        
        getPhysics() {
            const player = this.getLocalPlayer();
            if (!player) return null;
            
            return this.utils.deepFind(player, 'physics') || 
                   this.utils.deepFind(player, 'tankPhysics');
        }
        
        getCamera() {
            const player = this.getLocalPlayer();
            if (!player) return null;
            
            return this.utils.deepFind(player, 'camera') || 
                   this.utils.deepFind(player, 'followCamera');
        }
        
        getWeapon() {
            const player = this.getLocalPlayer();
            if (!player) return null;
            
            return this.utils.deepFind(player, 'weapon') || 
                   this.utils.deepFind(player, 'striker');
        }
    }
    
    // ================================
    // FEATURES
    // ================================
    class MutinyFeatures {
        constructor() {
            this.flight = new FlightFeature();
            this.vision = new VisionFeature();
            this.auto = new AutoFeature();
        }
    }
    
    class FlightFeature {
        constructor() {
            this.active = false;
            this.speed = 250;
            this.position = { x: 0, y: 0, z: 0 };
        }
        
        toggle() {
            this.active = !this.active;
            MUTINY.state.flightActive = this.active;
            MUTINY.ui.updateState('flight', this.active);
            
            if (this.active) {
                const physics = MUTINY.game.getPhysics();
                if (physics && physics.body) {
                    this.position = { ...physics.body.position };
                }
            }
            
            MUTINY.utils.log('Flight', this.active ? 'ON' : 'OFF');
        }
        
        process() {
            if (!this.active) return;
            
            const physics = MUTINY.game.getPhysics();
            const camera = MUTINY.game.getCamera();
            
            if (!physics || !camera) return;
            
            // Управление
            const dir = camera.rotation || 0;
            const move = this.speed * 0.05;
            
            // WASD управление
            if (window.isKeyPressed && window.isKeyPressed(87)) { // W
                this.position.x += Math.sin(dir) * move;
                this.position.z += Math.cos(dir) * move;
            }
            if (window.isKeyPressed && window.isKeyPressed(83)) { // S
                this.position.x -= Math.sin(dir) * move;
                this.position.z -= Math.cos(dir) * move;
            }
            if (window.isKeyPressed && window.isKeyPressed(65)) { // A
                this.position.x += Math.sin(dir - Math.PI/2) * move;
                this.position.z += Math.cos(dir - Math.PI/2) * move;
            }
            if (window.isKeyPressed && window.isKeyPressed(68)) { // D
                this.position.x += Math.sin(dir + Math.PI/2) * move;
                this.position.z += Math.cos(dir + Math.PI/2) * move;
            }
            if (window.isKeyPressed && window.isKeyPressed(81)) { // Q
                this.position.y += move;
            }
            if (window.isKeyPressed && window.isKeyPressed(69)) { // E
                this.position.y -= move;
            }
            
            // Применение позиции
            if (physics.body) {
                physics.body.position = this.position;
                physics.body.velocity = { x: 0, y: 0, z: 0 };
            }
        }
    }
    
    class VisionFeature {
        constructor() {
            this.active = true;
        }
        
        process() {
            if (!this.active) return;
            
            // Ищем все меши в сцене
            const meshes = this.findAllMeshes();
            meshes.forEach(mesh => {
                if (mesh && !mesh.isLocal) {
                    this.applyGlow(mesh);
                }
            });
        }
        
        findAllMeshes() {
            const meshes = [];
            
            // Поиск через Three.js/Playcanvas
            if (window.THREE) {
                const scene = window.THREE.Scene ? 
                    Object.values(window.THREE).find(s => s.children) : null;
                if (scene) {
                    scene.traverse(obj => {
                        if (obj.isMesh) meshes.push(obj);
                    });
                }
            }
            
            return meshes;
        }
        
        applyGlow(mesh) {
            if (!mesh.material) return;
            
            // Добавляем свечение
            mesh.material.emissive = mesh.material.emissive || { r: 1, g: 0, b: 0 };
            mesh.material.emissiveIntensity = 0.5;
            mesh.renderOrder = 999;
        }
    }
    
    class AutoFeature {
        process() {
            if (!MUTINY.state.autoMine) return;
            
            // Имитация нажатия кнопки мины
            this.simulateKeyPress(53); // Клавиша 5
        }
        
        simulateKeyPress(keyCode) {
            const event = new KeyboardEvent('keydown', {
                keyCode: keyCode,
                bubbles: true
            });
            document.dispatchEvent(event);
            
            setTimeout(() => {
                const eventUp = new KeyboardEvent('keyup', {
                    keyCode: keyCode,
                    bubbles: true
                });
                document.dispatchEvent(eventUp);
            }, 100);
        }
    }
    
    // ================================
    // UI SYSTEM
    // ================================
    class MutinyUI {
        constructor() {
            this.menu = null;
            this.styles = `
                #mutiny-menu {
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    background: rgba(0, 10, 20, 0.95);
                    border: 2px solid #0ff;
                    border-radius: 12px;
                    padding: 20px;
                    min-width: 300px;
                    z-index: 10000;
                    font-family: 'Courier New', monospace;
                    color: #0ff;
                    box-shadow: 0 0 30px rgba(0, 255, 255, 0.4);
                    backdrop-filter: blur(10px);
                    user-select: none;
                }
                .mutiny-title {
                    text-align: center;
                    font-size: 22px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #f0f;
                    text-shadow: 0 0 10px #f0f;
                    border-bottom: 2px solid #0ff;
                    padding-bottom: 10px;
                }
                .mutiny-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin: 12px 0;
                    padding: 8px;
                    background: rgba(0, 20, 40, 0.6);
                    border-radius: 6px;
                    transition: all 0.3s;
                }
                .mutiny-item:hover {
                    background: rgba(0, 40, 80, 0.8);
                    transform: translateX(5px);
                }
                .mutiny-label {
                    font-size: 16px;
                }
                .mutiny-status {
                    font-weight: bold;
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: 14px;
                }
                .status-on {
                    background: rgba(0, 255, 0, 0.2);
                    color: #0f0;
                    border: 1px solid #0f0;
                }
                .status-off {
                    background: rgba(255, 0, 0, 0.2);
                    color: #f00;
                    border: 1px solid #f00;
                }
                .mutiny-hotkey {
                    font-size: 12px;
                    color: #ff0;
                    margin-left: 10px;
                    opacity: 0.7;
                }
                .mutiny-footer {
                    margin-top: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                    border-top: 1px solid #333;
                    padding-top: 10px;
                }
            `;
        }
        
        setupUI() {
            // Добавляем стили
            const style = document.createElement('style');
            style.textContent = this.styles;
            document.head.appendChild(style);
            
            // Создаем меню
            this.menu = document.createElement('div');
            this.menu.id = 'mutiny-menu';
            this.menu.innerHTML = `
                <div class="mutiny-title">MUTINY.PW v1.1</div>
                
                <div class="mutiny-item">
                    <span class="mutiny-label">FLIGHT MODE</span>
                    <span id="mutiny-flight-status" class="mutiny-status status-off">OFF</span>
                    <span class="mutiny-hotkey">R.SHIFT</span>
                </div>
                
                <div class="mutiny-item">
                    <span class="mutiny-label">VISION</span>
                    <span id="mutiny-vision-status" class="mutiny-status status-on">ON</span>
                </div>
                
                <div class="mutiny-item">
                    <span class="mutiny-label">AUTO MINE</span>
                    <span id="mutiny-mine-status" class="mutiny-status status-off">OFF</span>
                    <span class="mutiny-hotkey">5</span>
                </div>
                
                <div class="mutiny-item">
                    <span class="mutiny-label">WEAPON MOD</span>
                    <span class="mutiny-status status-on">ACTIVE</span>
                </div>
                
                <div class="mutiny-footer">
                    INSERT - Hide/Show | MUTINY.PW Research
                </div>
            `;
            
            document.body.appendChild(this.menu);
            
            // Начальное состояние
            this.updateState('vision', true);
        }
        
        toggleMenu() {
            if (!this.menu) this.setupUI();
            this.menu.style.display = this.menu.style.display === 'none' ? 'block' : 'none';
            MUTINY.state.menuVisible = this.menu.style.display !== 'none';
            MUTINY.utils.log('Menu', MUTINY.state.menuVisible ? 'shown' : 'hidden');
        }
        
        updateState(feature, active) {
            if (!this.menu) return;
            
            const element = document.getElementById(`mutiny-${feature}-status`);
            if (element) {
                element.textContent = active ? 'ON' : 'OFF';
                element.className = `mutiny-status ${active ? 'status-on' : 'status-off'}`;
            }
        }
    }
    
    // ================================
    // ИНИЦИАЛИЗАЦИЯ
    // ================================
    
    // Экспорт в глобальную область
    window.MUTINY = MUTINY;
    
    // Автозапуск при готовности
    const init = () => {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(() => {
                if (!window.MUTINY_INITIALIZED && window.MUTINY && window.MUTINY.init) {
                    window.MUTINY.init();
                }
            }, 3000);
        }
    };
    
    // События загрузки
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Резервный запуск
    setTimeout(() => {
        if (!window.MUTINY_INITIALIZED && window.MUTINY && window.MUTINY.init) {
            window.MUTINY.init();
        }
    }, 5000);
    
    console.log('[MUTINY.PW] Core module loaded, waiting for initialization...');
})();