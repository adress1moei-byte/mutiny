// ================================
// MUTINY.PW CORE MODULE v1.2 - FIXED
// ================================
(function() {
    'use strict';
    
    if (window.MUTINY_V2) return;
    window.MUTINY_V2 = true;
    
    console.log('[MUTINY.PW] Core module loading...');
    
    // ================================
    // GLOBAL OBJECT DETECTOR
    // ================================
    class GameScanner {
        constructor() {
            this.cache = new Map();
            this.lastScan = 0;
            this.scanInterval = 2000;
            this.debug = true;
        }
        
        log(...args) {
            if (this.debug) console.log('[SCANNER]', ...args);
        }
        
        // Главный метод: найти все игровые объекты
        scan() {
            const now = Date.now();
            if (now - this.lastScan < this.scanInterval && this.cache.size > 0) {
                return this.getFromCache();
            }
            
            this.lastScan = now;
            const results = {
                root: this.findReactRoot(),
                gameInstance: this.findGameInstance(),
                physicsWorld: null,
                localPlayer: null,
                camera: null,
                weapon: null
            };
            
            // Поиск через игровые глобальные объекты
            this.scanWindowObjects(results);
            
            // Сохраняем в кэш
            for (const [key, value] of Object.entries(results)) {
                if (value) this.cache.set(key, value);
            }
            
            this.log('Scan results:', results);
            return results;
        }
        
        findReactRoot() {
            // Метод 1: Стандартный React root
            let root = document.getElementById('root');
            if (root && root._reactRootContainer) {
                const internal = root._reactRootContainer._internalRoot;
                if (internal && internal.current) {
                    this.log('Found React root via _reactRootContainer');
                    return internal.current;
                }
            }
            
            // Метод 2: Поиск через fiber nodes
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.__reactFiber || node.__reactInternalInstance$) {
                    this.log('Found React fiber node');
                    return node.__reactFiber || node.__reactInternalInstance$;
                }
            }
            
            // Метод 3: Поиск по данным игры
            const gameDivs = document.querySelectorAll('[class*="game"], [class*="battle"]');
            for (const div of gameDivs) {
                if (div.__reactProps) return div.__reactProps;
            }
            
            return null;
        }
        
        findGameInstance() {
            // Ищем глобальный объект игры
            const globalKeys = Object.keys(window).filter(k => 
                k.includes('game') || k.includes('Game') || 
                k.includes('tanki') || k.includes('Tanki')
            );
            
            for (const key of globalKeys) {
                const obj = window[key];
                if (obj && typeof obj === 'object') {
                    // Проверяем, что это похоже на игровой объект
                    if (obj.store || obj.state || obj.players || obj.world) {
                        this.log('Found game instance:', key);
                        return obj;
                    }
                }
            }
            
            // Ищем в прототипах
            for (const key in window) {
                try {
                    if (window[key] && window[key].prototype) {
                        const proto = window[key].prototype;
                        if (proto.render || proto.update || proto.physics) {
                            this.log('Found game prototype:', key);
                            return window[key];
                        }
                    }
                } catch(e) {}
            }
            
            return null;
        }
        
        scanWindowObjects(results) {
            // Сканируем все объекты в window
            const queue = [window];
            const visited = new Set();
            let depth = 0;
            
            while (queue.length > 0 && depth < 1000) {
                const current = queue.shift();
                if (!current || visited.has(current)) continue;
                visited.add(current);
                
                try {
                    // Проверяем, не это ли игровой объект
                    if (this.isGameObject(current)) {
                        this.analyzeObject(current, results);
                    }
                    
                    // Добавляем дочерние объекты
                    if (typeof current === 'object' && current !== null) {
                        for (const key in current) {
                            try {
                                const child = current[key];
                                if (child && typeof child === 'object') {
                                    queue.push(child);
                                }
                            } catch(e) {}
                        }
                    }
                } catch(e) {
                    // Игнорируем ошибки доступа
                }
                
                depth++;
            }
        }
        
        isGameObject(obj) {
            if (!obj || typeof obj !== 'object') return false;
            
            // Проверяем признаки игрового объекта
            const checks = [
                () => obj.body && obj.position && obj.velocity,
                () => obj.components && Array.isArray(obj.components),
                () => obj.world && obj.entities,
                () => obj.camera && (obj.rotation || obj.direction),
                () => obj.weapon && (obj.fire || obj.ammo),
                () => obj.physics && obj.colliders,
                () => obj.tank && obj.tank.tag,
                () => obj.store && obj.getState,
                () => obj.localPlayer && obj.players,
                () => obj.input && obj.keyboard
            ];
            
            return checks.some(check => {
                try { return check(); } catch(e) { return false; }
            });
        }
        
        analyzeObject(obj, results) {
            // Определяем тип объекта
            if (obj.body && (obj.position || obj.velocity)) {
                if (!results.physicsWorld && obj.world) {
                    results.physicsWorld = obj.world;
                    this.log('Found physics world');
                }
                if (!results.localPlayer && (obj.tag === 'LocalTank' || obj.isLocal)) {
                    results.localPlayer = obj;
                    this.log('Found local player');
                }
            }
            
            if (obj.camera && (obj.rotation || obj.direction)) {
                if (!results.camera) {
                    results.camera = obj;
                    this.log('Found camera');
                }
            }
            
            if (obj.weapon || obj.fire || obj.ammo) {
                if (!results.weapon && !obj.camera) {
                    results.weapon = obj;
                    this.log('Found weapon');
                }
            }
            
            // Проверяем store
            if (obj.store && !results.gameInstance) {
                results.gameInstance = obj;
                this.log('Found game store');
            }
        }
        
        getFromCache() {
            const result = {};
            for (const [key, value] of this.cache.entries()) {
                if (value && this.isValidObject(value)) {
                    result[key] = value;
                }
            }
            return result;
        }
        
        isValidObject(obj) {
            try {
                return obj && typeof obj === 'object' && !obj._destroyed;
            } catch(e) {
                return false;
            }
        }
    }
    
    // ================================
    // FEATURE MANAGER
    // ================================
    class FeatureManager {
        constructor(scanner) {
            this.scanner = scanner;
            this.features = new Map();
            this.active = {
                flight: false,
                vision: true,
                autoMine: false,
                weaponMod: true
            };
            this.keys = {
                flight: 16,     // R.Shift
                mine: 53,       // 5
                menu: 45,       // Insert
                explode: 82     // R
            };
            
            this.setupFeatures();
            this.setupHotkeys();
        }
        
        setupFeatures() {
            // Flight (AirBreak)
            this.features.set('flight', {
                name: 'Flight Mode',
                toggle: () => {
                    this.active.flight = !this.active.flight;
                    console.log(`[MUTINY] Flight ${this.active.flight ? 'ON' : 'OFF'}`);
                    
                    if (this.active.flight) {
                        const player = this.scanner.scan().localPlayer;
                        if (player && player.body) {
                            this.flightStartPos = {
                                x: player.body.position?.x || 0,
                                y: player.body.position?.y || 0,
                                z: player.body.position?.z || 0
                            };
                        }
                    }
                },
                process: () => {
                    if (!this.active.flight) return;
                    
                    const scan = this.scanner.scan();
                    const player = scan.localPlayer;
                    const camera = scan.camera;
                    
                    if (!player || !camera || !player.body) return;
                    
                    // Управление
                    const speed = 10;
                    let moveX = 0, moveY = 0, moveZ = 0;
                    
                    if (window.isKeyPressed && window.isKeyPressed(87)) moveZ -= speed; // W
                    if (window.isKeyPressed && window.isKeyPressed(83)) moveZ += speed; // S
                    if (window.isKeyPressed && window.isKeyPressed(65)) moveX -= speed; // A
                    if (window.isKeyPressed && window.isKeyPressed(68)) moveX += speed; // D
                    if (window.isKeyPressed && window.isKeyPressed(81)) moveY += speed; // Q
                    if (window.isKeyPressed && window.isKeyPressed(69)) moveY -= speed; // E
                    
                    // Применяем движение
                    if (moveX !== 0 || moveY !== 0 || moveZ !== 0) {
                        // Получаем направление камеры
                        const rotation = camera.rotation || camera.direction || 0;
                        
                        // Поворачиваем вектор по направлению камеры
                        const cos = Math.cos(rotation);
                        const sin = Math.sin(rotation);
                        
                        const rotatedX = moveX * cos - moveZ * sin;
                        const rotatedZ = moveX * sin + moveZ * cos;
                        
                        // Обновляем позицию
                        player.body.position.x += rotatedX;
                        player.body.position.y += moveY;
                        player.body.position.z += rotatedZ;
                        
                        // Сбрасываем скорость
                        if (player.body.velocity) {
                            player.body.velocity.x = 0;
                            player.body.velocity.y = 0;
                            player.body.velocity.z = 0;
                        }
                    }
                }
            });
            
            // Vision (WallHack)
            this.features.set('vision', {
                name: 'Vision',
                process: () => {
                    if (!this.active.vision) return;
                    
                    // Ищем все меши в сцене
                    this.applyWallhack();
                }
            });
            
            // Weapon Mod
            this.features.set('weapon', {
                name: 'Weapon Mod',
                init: () => {
                    if (!this.active.weaponMod) return;
                    
                    const scan = this.scanner.scan();
                    const weapon = scan.weapon;
                    
                    if (weapon) {
                        // Убираем ограничения прицела
                        if (weapon.targetingSystem) {
                            if (weapon.targetingSystem.maxAngle) {
                                weapon.targetingSystem.maxAngle = 99999;
                            }
                            if (weapon.targetingSystem.minAngle) {
                                weapon.targetingSystem.minAngle = -99999;
                            }
                        }
                        
                        // Увеличиваем скорость снарядов
                        if (weapon.projectiles) {
                            weapon.projectiles.forEach(proj => {
                                if (proj.speed) {
                                    proj.speed.max = 35000;
                                    proj.speed.min = 2000;
                                }
                            });
                        }
                        
                        console.log('[MUTINY] Weapon mod applied');
                    }
                },
                process: () => {
                    if (!this.active.weaponMod) return;
                    
                    // Эксплодим ракеты по R
                    if (window.isKeyPressed && window.isKeyPressed(this.keys.explode)) {
                        const weapon = this.scanner.scan().weapon;
                        if (weapon && weapon.explodeRockets) {
                            weapon.explodeRockets();
                        }
                    }
                }
            });
            
            // Auto Mine
            this.features.set('mine', {
                name: 'Auto Mine',
                toggle: () => {
                    this.active.autoMine = !this.active.autoMine;
                    console.log(`[MUTINY] Auto mine ${this.active.autoMine ? 'ON' : 'OFF'}`);
                },
                process: () => {
                    if (!this.active.autoMine) return;
                    
                    // Имитируем нажатие мины
                    this.simulateMineKey();
                }
            });
        }
        
        applyWallhack() {
            // Метод 1: Через Three.js
            if (window.THREE && window.THREE.Scene) {
                const scenes = Object.values(window).filter(v => 
                    v && v.isScene && v.children
                );
                
                scenes.forEach(scene => {
                    scene.traverse(obj => {
                        if (obj.isMesh && obj.material) {
                            // Подсвечиваем врагов красным
                            if (obj.userData && obj.userData.isEnemy) {
                                obj.material.emissive = new window.THREE.Color(0xff0000);
                                obj.material.emissiveIntensity = 0.5;
                                obj.renderOrder = 999;
                            }
                            
                            // Делаем объекты полупрозрачными
                            if (obj.material.opacity !== undefined) {
                                obj.material.transparent = true;
                                obj.material.opacity = 0.7;
                            }
                        }
                    });
                });
            }
            
            // Метод 2: Через DOM элементы игры
            const gameElements = document.querySelectorAll('[class*="tank"], [class*="vehicle"], [class*="enemy"]');
            gameElements.forEach(el => {
                if (el.style) {
                    el.style.boxShadow = '0 0 10px #ff0000';
                    el.style.filter = 'brightness(1.5)';
                }
            });
        }
        
        simulateMineKey() {
            // Создаем события нажатия клавиши мины
            const eventDown = new KeyboardEvent('keydown', {
                keyCode: 53, // 5
                bubbles: true,
                cancelable: true
            });
            
            const eventUp = new KeyboardEvent('keyup', {
                keyCode: 53,
                bubbles: true,
                cancelable: true
            });
            
            document.dispatchEvent(eventDown);
            setTimeout(() => document.dispatchEvent(eventUp), 50);
        }
        
        setupHotkeys() {
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                
                switch(e.keyCode) {
                    case this.keys.flight:
                        if (e.location === 2) { // Right Shift
                            this.features.get('flight').toggle();
                            e.preventDefault();
                        }
                        break;
                        
                    case this.keys.mine:
                        this.features.get('mine').toggle();
                        e.preventDefault();
                        break;
                        
                    case this.keys.explode:
                        // Обрабатывается в weapon.process
                        break;
                }
            });
        }
        
        processAll() {
            this.features.forEach(feature => {
                try {
                    if (feature.process) feature.process();
                } catch(e) {
                    console.error('[MUTINY] Feature error:', feature.name, e);
                }
            });
        }
        
        initFeatures() {
            this.features.forEach(feature => {
                try {
                    if (feature.init) feature.init();
                } catch(e) {
                    console.error('[MUTINY] Init error:', feature.name, e);
                }
            });
        }
    }
    
    // ================================
    // UI MANAGER (упрощенный)
    // ================================
    class UIManager {
        constructor(featureManager) {
            this.features = featureManager;
            this.menu = null;
            this.visible = true;
            
            this.createMenu();
            this.setupToggle();
        }
        
        createMenu() {
            // Удаляем старое меню если есть
            const old = document.getElementById('mutiny-menu-v2');
            if (old) old.remove();
            
            // Создаем стили
            const style = document.createElement('style');
            style.textContent = `
                #mutiny-menu-v2 {
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    background: rgba(10, 0, 20, 0.95);
                    border: 2px solid #f0f;
                    border-radius: 10px;
                    padding: 15px;
                    min-width: 250px;
                    z-index: 99999;
                    font-family: 'Arial', sans-serif;
                    color: white;
                    box-shadow: 0 0 20px rgba(0, 221, 255, 0.5);
                    backdrop-filter: blur(5px);
                }
                .mutiny-title {
                    color: #0ff;
                    font-size: 18px;
                    font-weight: bold;
                    text-align: center;
                    margin-bottom: 10px;
                    border-bottom: 1px solid #0ff;
                    padding-bottom: 5px;
                }
                .mutiny-item {
                    display: flex;
                    justify-content: space-between;
                    margin: 8px 0;
                    padding: 5px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 4px;
                }
                .mutiny-status {
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-weight: bold;
                    font-size: 12px;
                }
                .status-on {
                    background: #0a0;
                    color: white;
                }
                .status-off {
                    background: #a00;
                    color: white;
                }
                .mutiny-hotkey {
                    font-size: 11px;
                    color: #ff0;
                    margin-left: 8px;
                }
                .mutiny-debug {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid #333;
                    font-size: 10px;
                    color: #888;
                }
            `;
            document.head.appendChild(style);
            
            // Создаем меню
            this.menu = document.createElement('div');
            this.menu.id = 'mutiny-menu-v2';
            this.menu.innerHTML = `
                <div class="mutiny-title">MUTINY.PW v1.2</div>
                <div id="mutiny-content">
                    <div class="mutiny-item">
                        <span>Flight Mode</span>
                        <span id="status-flight" class="mutiny-status status-off">OFF</span>
                        <span class="mutiny-hotkey">R.SHIFT</span>
                    </div>
                    <div class="mutiny-item">
                        <span>Vision</span>
                        <span id="status-vision" class="mutiny-status status-on">ON</span>
                    </div>
                    <div class="mutiny-item">
                        <span>Auto Mine</span>
                        <span id="status-mine" class="mutiny-status status-off">OFF</span>
                        <span class="mutiny-hotkey">5</span>
                    </div>
                    <div class="mutiny-item">
                        <span>Weapon Mod</span>
                        <span id="status-weapon" class="mutiny-status status-on">ACTIVE</span>
                    </div>
                </div>
                <div class="mutiny-debug" id="mutiny-debug">
                    Status: Initializing...
                </div>
            `;
            
            document.body.appendChild(this.menu);
            
            // Обновляем статусы
            this.updateStates();
        }
        
        updateStates() {
            if (!this.menu) return;
            
            const states = this.features.active;
            
            document.getElementById('status-flight').className = 
                `mutiny-status ${states.flight ? 'status-on' : 'status-off'}`;
            document.getElementById('status-flight').textContent = 
                states.flight ? 'ON' : 'OFF';
                
            document.getElementById('status-vision').className = 
                `mutiny-status ${states.vision ? 'status-on' : 'status-off'}`;
                
            document.getElementById('status-mine').className = 
                `mutiny-status ${states.autoMine ? 'status-on' : 'status-off'}`;
            document.getElementById('status-mine').textContent = 
                states.autoMine ? 'ON' : 'OFF';
        }
        
        updateDebug(info) {
            const debugEl = document.getElementById('mutiny-debug');
            if (debugEl) {
                debugEl.innerHTML = `Scan: ${info.objectsFound} objects | Player: ${info.hasPlayer ? 'Found' : 'Searching'}`;
            }
        }
        
        setupToggle() {
            document.addEventListener('keydown', (e) => {
                if (e.keyCode === 45 && !e.repeat) { // INSERT
                    this.visible = !this.visible;
                    this.menu.style.display = this.visible ? 'block' : 'none';
                    e.preventDefault();
                }
            });
        }
    }
    
    // ================================
    // MAIN INITIALIZATION
    // ================================
    const init = () => {
        console.log('[MUTINY.PW] Starting engine...');
        
        // Создаем сканнер
        const scanner = new GameScanner();
        
        // Первичное сканирование
        const initialScan = scanner.scan();
        console.log('[MUTINY.PW] Initial scan:', initialScan);
        
        // Создаем менеджер функций
        const featureManager = new FeatureManager(scanner);
        
        // Создаем UI
        const ui = new UIManager(featureManager);
        
        // Инициализируем функции
        setTimeout(() => {
            featureManager.initFeatures();
            console.log('[MUTINY.PW] Features initialized');
        }, 1000);
        
        // Главный цикл
        const gameLoop = () => {
            try {
                // Сканируем обновления
                const scan = scanner.scan();
                
                // Обновляем UI
                ui.updateStates();
                ui.updateDebug({
                    objectsFound: Object.keys(scan).filter(k => scan[k]).length,
                    hasPlayer: !!scan.localPlayer
                });
                
                // Выполняем функции
                featureManager.processAll();
                
                // Проверяем работу flight
                if (featureManager.active.flight && scan.localPlayer) {
                    const pos = scan.localPlayer.body?.position;
                    if (pos) {
                        document.getElementById('mutiny-debug').innerHTML += 
                            `<br>Flight pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
                    }
                }
                
            } catch (e) {
                console.error('[MUTINY.PW] Loop error:', e);
            }
            
            requestAnimationFrame(gameLoop);
        };
        
        // Запускаем цикл
        gameLoop();
        
        console.log('[MUTINY.PW] Engine started successfully!');
        
        // Возвращаем публичный API
        return {
            scanner,
            features: featureManager,
            ui,
            version: '1.2',
            
            // Методы для отладки
            forceScan: () => scanner.scan(),
            toggleFlight: () => featureManager.features.get('flight').toggle(),
            toggleMine: () => featureManager.features.get('mine').toggle()
        };
    };
    
    // Экспортируем API
    window.MUTINY_API = init();
    
    console.log('[MUTINY.PW] Core module ready');
    
})(window);
// ================================
// DEBUG COMMANDS
// ================================
setTimeout(() => {
    // Добавляем команды в консоль для отладки
    window.MUTINY_DEBUG = {
        // Ручной поиск объектов
        findObjects: () => {
            console.log('=== MUTINY DEBUG ===');
            
            // Ищем React
            const root = document.getElementById('root');
            console.log('Root element:', root);
            console.log('React root:', root?._reactRootContainer);
            
            // Ищем игровые объекты в window
            const gameKeys = Object.keys(window).filter(k => 
                k.toLowerCase().includes('game') || 
                k.toLowerCase().includes('tank') ||
                k.toLowerCase().includes('physics')
            );
            console.log('Game keys in window:', gameKeys);
            
            // Проверяем найденные объекты
            gameKeys.forEach(key => {
                try {
                    const obj = window[key];
                    console.log(`  ${key}:`, typeof obj, obj);
                } catch(e) {}
            });
            
            // Ищем Three.js
            if (window.THREE) {
                console.log('THREE.js found:', Object.keys(window.THREE).slice(0, 10));
            }
        },
        
        // Тест функций
        testFlight: () => {
            console.log('Testing flight...');
            if (window.MUTINY_API) {
                window.MUTINY_API.toggleFlight();
            }
        },
        
        // Получить текущую позицию
        getPosition: () => {
            if (window.MUTINY_API && window.MUTINY_API.scanner) {
                const scan = window.MUTINY_API.scanner.scan();
                console.log('Player position:', scan.localPlayer?.body?.position);
                return scan.localPlayer?.body?.position;
            }
            return null;
        },
        
        // Пересканировать всё
        rescan: () => {
            if (window.MUTINY_API) {
                console.log('Rescanning...');
                return window.MUTINY_API.forceScan();
            }
        }
    };
    
    console.log('[MUTINY] Debug commands loaded. Use:');
    console.log('  MUTINY_DEBUG.findObjects() - найти объекты');
    console.log('  MUTINY_DEBUG.testFlight() - тест полета');
    console.log('  MUTINY_DEBUG.getPosition() - позиция игрока');
    console.log('  MUTINY_DEBUG.rescan() - пересканировать');
}, 3000);