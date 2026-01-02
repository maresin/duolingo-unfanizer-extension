document.addEventListener('DOMContentLoaded', function() {
  // Элементы UI
  const analyzeBtn = document.getElementById('analyzeBtn');
  const unfollowBtn = document.getElementById('unfollowBtn');
  const userListSection = document.getElementById('userListSection');
  const userList = document.getElementById('userList');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
  const selectedUsersCount = document.getElementById('selectedUsersCount');
  const status = document.getElementById('status');
  const progressBar = document.querySelector('.progress-bar');
  const log = document.getElementById('log');
  const totalFollowing = document.getElementById('totalFollowing');
  const totalFollowers = document.getElementById('totalFollowers');
  const extraFollowing = document.getElementById('extraFollowing');
  const maxUnfollow = document.getElementById('maxUnfollow');

  let isRunning = false;
  let currentUsers = []; // Массив пользователей для удаления
  let selectedUserIds = new Set(); // Выбранные ID

  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
  function logMessage(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  function updateStatus(text, type = '') {
    status.textContent = text;
    status.className = `status ${type}`;
  }

  function updateProgress(current, total) {
    if (total === 0) {
      progressBar.style.width = '0%';
      return;
    }
    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = `${percentage}%`;
  }

  function updateStats(data) {
    totalFollowing.textContent = data.totalFollowing || 0;
    totalFollowers.textContent = data.totalFollowers || 0;
    extraFollowing.textContent = data.extraFollowing || 0;
  }

  // === ФУНКЦИИ ДЛЯ СПИСКА ПОЛЬЗОВАТЕЛЕЙ ===
  function showUserList(users) {
    currentUsers = users;
    selectedUserIds = new Set(users.map(user => user.userId));
    
    // Показываем секцию списка
    userListSection.classList.remove('hidden');
    
    // Очищаем и заполняем список
    userList.innerHTML = '';
    
    users.forEach(user => {
      const userItem = createUserItem(user);
      userList.appendChild(userItem);
    });
    
    updateSelectionCount();
    updateDeleteButtonState();
  }

  function createUserItem(user) {
    const li = document.createElement('li');
    li.className = 'user-item';
    li.dataset.userId = user.userId;
    
    // Первая буква для fallback аватара
    const firstLetter = user.username.charAt(0).toUpperCase();
    
    li.innerHTML = `
      <input type="checkbox" class="user-checkbox" id="user_${user.userId}" 
             ${selectedUserIds.has(user.userId) ? 'checked' : ''}>
      <label for="user_${user.userId}" class="material-checkbox"></label>
      
      ${user.avatarUrl ? 
        `<img class="user-avatar" src="${user.avatarUrl}" alt="${user.username}" 
              data-profile-url="${user.profileUrl}">` :
        `<div class="avatar-fallback">${firstLetter}</div>`
      }
      
      <div class="user-info">
        <span class="user-name" data-profile-url="${user.profileUrl}">
          ${user.username}
        </span>
        <div class="user-details">
          <span class="user-id">#${user.userId}</span>
          ${user.xp ? `<span class="user-xp">${user.xp}</span>` : ''}
        </div>
      </div>
    `;
    
    // Обработчики событий
    const checkbox = li.querySelector('.user-checkbox');
    const avatar = li.querySelector('.user-avatar, .avatar-fallback');
    const userName = li.querySelector('.user-name');
    
    checkbox.addEventListener('change', (e) => {
      handleUserSelection(user.userId, e.target.checked);
    });
    
    // Клик на аватар или имя → открыть профиль
    [avatar, userName].forEach(el => {
      if (el) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (user.profileUrl) {
            chrome.tabs.create({ url: user.profileUrl, active: false });
          }
        });
      }
    });
    
    return li;
  }

  function handleUserSelection(userId, isSelected) {
    if (isSelected) {
      selectedUserIds.add(userId);
    } else {
      selectedUserIds.delete(userId);
    }
    
    updateSelectionCount();
    updateDeleteButtonState();
    updateSelectAllState();
  }

  function updateSelectionCount() {
    selectedUsersCount.textContent = selectedUserIds.size;
  }

  function updateDeleteButtonState() {
    deleteSelectedBtn.disabled = selectedUserIds.size === 0;
    deleteSelectedBtn.textContent = `Удалить выбранные (${selectedUserIds.size})`;
    
    // Обновляем основную кнопку удаления
    unfollowBtn.disabled = selectedUserIds.size === 0;
  }

  function updateSelectAllState() {
    const allSelected = selectedUserIds.size === currentUsers.length;
    const someSelected = selectedUserIds.size > 0 && !allSelected;
    
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected;
  }

  // === ОСНОВНЫЕ ФУНКЦИИ ===
  async function analyzeSubscriptions() {
    if (isRunning) return;
    
    isRunning = true;
    updateStatus('Анализируем...', 'working');
    unfollowBtn.disabled = true;
    analyzeBtn.disabled = true;
    log.innerHTML = '';
    
    logMessage('Начинаем анализ подписок...', 'info');
    
    try {
      const result = await sendMessage('analyze');
      
      if (result.success) {
        updateStats(result.data);
        updateStatus('Анализ завершен', 'success');
        
        const extra = result.data.extraFollowing || 0;
        unfollowBtn.disabled = extra === 0;
        
        logMessage(`Подписок: ${result.data.totalFollowing}, Подписчиков: ${result.data.totalFollowers}`, 'success');
        
        if (extra > 0) {
          logMessage(`Найдено подписок для удаления: ${extra}`, 'warning');
          // TODO: Получить детальный список пользователей и показать его
          // showUserList(detailedUsers);
        }
        
      } else {
        updateStatus('Ошибка', 'error');
        logMessage(result.error, 'error');
      }
    } catch (error) {
      updateStatus('Ошибка', 'error');
      logMessage(error.message, 'error');
    } finally {
      isRunning = false;
      analyzeBtn.disabled = false;
      updateProgress(0, 1);
    }
  }

  async function cleanSubscriptions() {
    if (isRunning) return;
    
    isRunning = true;
    
    const max = parseInt(maxUnfollow.value) || 3;
    
    updateStatus('Удаляем...', 'working');
    analyzeBtn.disabled = true;
    unfollowBtn.disabled = true;
    log.innerHTML = '';
    
    logMessage(`Удаляем до ${max} подписок...`, 'info');
    
    try {
      const result = await sendMessage('clean', { maxUnfollow: max });
      
      if (result.success) {
        updateStats(result.data);
        
        if (result.data.backgroundStarted) {
          updateStatus('Удаление запущено', 'working');
          logMessage('Удаление запущено в фоне', 'success');
        } else if (result.data.cleanedCount > 0) {
          updateStatus(`Удалено: ${result.data.cleanedCount}`, 'success');
          logMessage(`Удалено ${result.data.cleanedCount} подписок`, 'success');
        } else {
          updateStatus('Завершено', 'info');
        }
        
        const remaining = result.data.extraFollowing || 0;
        unfollowBtn.disabled = remaining === 0;
        
      } else {
        updateStatus('Ошибка', 'error');
        logMessage(result.error, 'error');
      }
    } catch (error) {
      updateStatus('Ошибка', 'error');
      logMessage(error.message, 'error');
    } finally {
      isRunning = false;
      analyzeBtn.disabled = false;
      unfollowBtn.disabled = false;
      updateProgress(0, 1);
    }
  }

  async function sendMessage(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          resolve({ success: false, error: 'Нет активной вкладки' });
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { action, ...data }, resolve);
      });
    });
  }

  // === ОБРАБОТЧИКИ СОБЫТИЙ ===
  analyzeBtn.addEventListener('click', analyzeSubscriptions);
  unfollowBtn.addEventListener('click', cleanSubscriptions);
  
  selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    
    currentUsers.forEach(user => {
      const checkbox = document.getElementById(`user_${user.userId}`);
      if (checkbox) {
        checkbox.checked = isChecked;
        handleUserSelection(user.userId, isChecked);
      }
    });
  });
  
  deleteSelectedBtn.addEventListener('click', async () => {
    if (selectedUserIds.size === 0) return;
    
    const confirmed = confirm(`Удалить ${selectedUserIds.size} подписок?`);
    if (!confirmed) return;
    
    // TODO: Реализовать удаление выбранных пользователей
    // Нужно будет модифицировать content.js для поддержки выборочного удаления
    logMessage(`Начинаем удаление ${selectedUserIds.size} выбранных подписок...`, 'warning');
  });

  // === ИНИЦИАЛИЗАЦИЯ ===
  chrome.storage.local.get(['settings'], (result) => {
    if (result.settings && result.settings.maxUnfollow) {
      maxUnfollow.value = result.settings.maxUnfollow;
    }
  });

  function saveSettings() {
    chrome.storage.local.set({
      settings: {
        maxUnfollow: parseInt(maxUnfollow.value) || 3
      }
    });
  }

  maxUnfollow.addEventListener('change', saveSettings);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateProgress') {
      updateProgress(message.current, message.total);
    } else if (message.action === 'log') {
      logMessage(message.text, message.type);
    } else if (message.action === 'updateStats') {
      updateStats(message.data);
    }
  });

  updateProgress(0, 1);
});