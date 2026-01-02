class DuolingoFriendsHarmonizer {
  constructor() {
    this.isRunning = false;
    this.stopRequested = false;
    this.followers = new Map();
    this.following = new Map();
    this.nonMutualFollowing = new Map();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(message, type = 'info') {
    chrome.runtime.sendMessage({
      action: 'log',
      text: message,
      type: type
    });
  }

  updateProgress(current, total) {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      current,
      total
    });
  }

  updateStats() {
    chrome.runtime.sendMessage({
      action: 'updateStats',
      data: {
        totalFollowing: this.following.size,
        totalFollowers: this.followers.size,
        extraFollowing: this.nonMutualFollowing.size
      }
    });
  }

  async clickFollowersButton() {
    const followersSpan = document.querySelector('span[data-test="friend-followers-list"]');
    if (followersSpan) {
      this.log('Нашли кнопку "Подписчики"', 'success');
      followersSpan.click();
      await this.sleep(2000);
      return true;
    }
    return false;
  }

  async clickFollowingButton() {
    const followingSpan = document.querySelector('span[data-test="friend-following-list"]');
    if (followingSpan) {
      this.log('Нашли кнопку "Подписки"', 'success');
      followingSpan.click();
      await this.sleep(2000);
      return true;
    }
    return false;
  }

  async clickShowMoreButton() {
    const showMoreBtn = document.querySelector('button._1gEmM._7jW2t._3jvnF');
    if (showMoreBtn) {
      this.log(`Нажимаем: "${showMoreBtn.textContent.trim()}"`, 'success');
      showMoreBtn.click();
      await this.sleep(3000);
      return true;
    }
    return false;
  }

  async closeModal() {
    const closeSvg = document.querySelector('img[src*="ed25a8cf69261b0c1e25b147f369f74a.svg"]');
    if (closeSvg) {
      this.log('Закрываем окно', 'info');
      closeSvg.click();
      await this.sleep(1000);
      return;
    }
    
    document.elementFromPoint(10, 10)?.click();
    await this.sleep(1000);
  }

  parseFriendEntries() {
    const users = new Map();
    
    const friendEntries = document.querySelectorAll('[data-test="friend-entry"]');
    this.log(`Найдено элементов: ${friendEntries.length}`, 'info');
    
    friendEntries.forEach((entry, index) => {
      try {
        // Ищем ссылку
        let profileUrl = null;
        let userId = null;
        
        if (entry.tagName === 'A' && entry.href) {
          profileUrl = entry.href;
        } else {
          const link = entry.closest('a[href]') || entry.querySelector('a[href]');
          if (link?.href) {
            profileUrl = link.href;
          }
        }
        
        if (!profileUrl) {
          return;
        }
        
        // Извлекаем ID из ссылки
        const match = profileUrl.match(/\/u\/(\d+)/);
        if (!match) {
          return;
        }
        
        userId = match[1];
        
        // Ищем имя для логов
        let username = `user_${userId}`;
        const text = entry.textContent || '';
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        
        for (const line of lines) {
          if (line && line.length > 1 && !line.match(/^\d/) && !line.match(/\d+\s+очк/)) {
            username = line;
            break;
          }
        }
        
        // === ДОБАВЛЕНО: Парсинг аватарки и XP ===
        let avatarUrl = null;
        let xpText = '';
        
        // Ищем аватарку (любой img с ssr-avatars в src)
        const imgs = entry.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.src || '';
          if (src.includes('ssr-avatars/')) {
            avatarUrl = src;
            break;
          }
        }
        
        // Ищем XP (если есть)
        const xpElement = entry.querySelector('div[class*="очков"], div[class*="points"]');
        if (xpElement) {
          xpText = xpElement.textContent.trim();
        }
        // === КОНЕЦ ДОБАВЛЕНИЯ ===
        
        // Сохраняем
        users.set(userId, {
          userId,
          username,
          profileUrl: `https://www.duolingo.com/u/${userId}`,
          avatarUrl,    // ← добавлено
          xp: xpText    // ← добавлено
        });
        
      } catch (error) {
        console.log(`Ошибка парсинга:`, error);
      }
    });
    
    this.log(`Собрано пользователей: ${users.size}`, 'success');
    return users;
  }

  async collectFollowers() {
    this.log('Собираем подписчиков', 'info');
    
    const clicked = await this.clickFollowersButton();
    if (!clicked) {
      this.log('Не нашли кнопку', 'error');
      return new Map();
    }
    
    await this.sleep(3000);
    await this.clickShowMoreButton();
    await this.sleep(4000);
    
    const users = this.parseFriendEntries();
    
    await this.closeModal();
    await this.sleep(2000);
    
    return users;
  }

  async collectFollowing() {
    this.log('Собираем подписки', 'info');
    
    const clicked = await this.clickFollowingButton();
    if (!clicked) {
      this.log('Не нашли кнопку', 'error');
      return new Map();
    }
    
    await this.sleep(3000);
    await this.clickShowMoreButton();
    await this.sleep(4000);
    
    const users = this.parseFriendEntries();
    
    await this.closeModal();
    await this.sleep(2000);
    
    return users;
  }

  async analyzeSubscriptions() {
    this.log('Начинаем анализ', 'info');
    
    if (!window.location.href.includes('/profile/') && !window.location.href.includes('/u/')) {
      this.log('Вы не на странице профиля!', 'error');
      return { success: false, error: 'Не на странице профиля' };
    }
    
    this.log('1. Собираем подписчиков', 'info');
    this.followers = await this.collectFollowers();
    this.log(`Подписчиков: ${this.followers.size}`, this.followers.size > 0 ? 'success' : 'error');
    
    if (this.stopRequested) return { success: false, error: 'Остановлено' };
    
    this.log('2. Собираем подписки', 'info');
    this.following = await this.collectFollowing();
    this.log(`Подписок: ${this.following.size}`, this.following.size > 0 ? 'success' : 'error');
    
    if (this.stopRequested) return { success: false, error: 'Остановлено' };
    
    this.log('3. Сравниваем списки', 'info');
    this.nonMutualFollowing = new Map();
    
    for (const [userId, userInfo] of this.following) {
      if (!this.followers.has(userId)) {
        this.nonMutualFollowing.set(userId, userInfo);
      }
    }
    
    // Отладочный вывод
    console.log('Following IDs:', Array.from(this.following.keys()));
    console.log('Followers IDs:', Array.from(this.followers.keys()));
    console.log('To unfollow IDs:', Array.from(this.nonMutualFollowing.keys()));
    
    this.log('Результаты:', 'success');
    this.log(`   Подписчиков: ${this.followers.size}`, 'info');
    this.log(`   Подписок: ${this.following.size}`, 'info');
    this.log(`   Удалить: ${this.nonMutualFollowing.size}`, 
             this.nonMutualFollowing.size > 0 ? 'warning' : 'success');
    
    if (this.nonMutualFollowing.size > 0) {
      this.log('Для удаления:', 'warning');
      Array.from(this.nonMutualFollowing.values()).forEach((user, i) => {
        this.log(`   ${i + 1}. ${user.username}`, 'warning');
      });
    }
    
    this.updateStats();
    
    return {
      success: true,
      data: {
        totalFollowing: this.following.size,
        totalFollowers: this.followers.size,
        extraFollowing: this.nonMutualFollowing.size
      }
    };
  }

  async cleanSubscriptions(maxUnfollow = 3) {
    if (!this.nonMutualFollowing.size) {
      const result = await this.analyzeSubscriptions();
      if (!result.success) return result;
    }
    
    if (!this.nonMutualFollowing.size) {
      this.log('Все подписки взаимны!', 'success');
      return { success: true, data: { cleanedCount: 0 } };
    }
    
    this.log('Удаление подписок', 'warning');
    
    const maxToProcess = Math.min(maxUnfollow, this.nonMutualFollowing.size);
    const usersToProcess = Array.from(this.nonMutualFollowing.values()).slice(0, maxToProcess);
    
    this.log(`Удаляем ${usersToProcess.length} подписок`, 'warning');
    
    const usersForBackground = usersToProcess.map(user => ({
      username: user.username,
      profileUrl: user.profileUrl,
      userId: user.userId,
      avatarUrl: user.avatarUrl,    // ← добавлено
      xp: user.xp                   // ← добавлено
    }));
    
    this.log(`Список:`, 'info');
    usersForBackground.forEach((user, index) => {
      this.log(`${index + 1}. ${user.username}`, 'info');
    });
    
    try {
      chrome.runtime.sendMessage({
        action: 'startBackgroundUnfollow',
        users: usersForBackground,
        maxUnfollow: maxToProcess
      }, (response) => {
        if (chrome.runtime.lastError) {
          this.log(`Ошибка: ${chrome.runtime.lastError.message}`, 'error');
          return;
        }
        
        if (response && response.success) {
          this.log(`Удаление запущено!`, 'success');
        }
      });
    } catch (error) {
      this.log(`Ошибка: ${error.message}`, 'error');
      return {
        success: false,
        error: `Не удалось запустить: ${error.message}`
      };
    }
    
    // Обновляем локально
    const newFollowing = new Map(this.following);
    usersToProcess.forEach(user => {
      newFollowing.delete(user.userId);
    });
    
    this.following = newFollowing;
    this.nonMutualFollowing = new Map(
      Array.from(this.nonMutualFollowing.entries())
        .filter(([key]) => !usersToProcess.find(u => u.userId === key))
    );
    
    this.updateStats();
    
    return {
      success: true,
      data: {
        backgroundStarted: true,
        totalUsers: usersForBackground.length,
        cleanedCount: usersForBackground.length
      }
    };
  }

  stop() {
    this.stopRequested = true;
    this.log('Остановка', 'warning');
  }
}

const harmonizer = new DuolingoFriendsHarmonizer();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyze') {
    if (harmonizer.isRunning) {
      sendResponse({ success: false, error: 'Уже выполняется' });
      return;
    }
    
    harmonizer.isRunning = true;
    harmonizer.stopRequested = false;
    
    harmonizer.analyzeSubscriptions()
      .then(result => {
        harmonizer.isRunning = false;
        sendResponse(result);
      })
      .catch(error => {
        harmonizer.isRunning = false;
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (request.action === 'getDetailedList') {
    // Новый action: возвращаем детальный список для удаления
    const usersArray = Array.from(harmonizer.nonMutualFollowing.values());
    sendResponse({ 
      success: true, 
      users: usersArray 
    });
    return true;
  }
  
  if (request.action === 'clean') {
    if (harmonizer.isRunning) {
      sendResponse({ success: false, error: 'Уже выполняется' });
      return;
    }
    
    harmonizer.isRunning = true;
    harmonizer.stopRequested = false;
    
    harmonizer.cleanSubscriptions(request.maxUnfollow)
      .then(result => {
        harmonizer.isRunning = false;
        sendResponse(result);
      })
      .catch(error => {
        harmonizer.isRunning = false;
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
  
  if (request.action === 'stop') {
    harmonizer.stop();
    sendResponse({ success: true });
  }
});
