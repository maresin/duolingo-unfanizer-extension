let unfollowQueue = [];
let isProcessing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startBackgroundUnfollow') {
    if (isProcessing) {
      sendResponse({ success: false, error: 'Уже выполняется' });
      return true;
    }
    
    const maxUsers = message.maxUnfollow || 3;
    unfollowQueue = message.users.slice(0, maxUsers);
    isProcessing = true;
    
    console.log(`Запуск удаления ${unfollowQueue.length} подписок`);
    
    processUnfollowQueue();
    
    sendResponse({ 
      success: true, 
      total: unfollowQueue.length 
    });
    return true;
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processUnfollowQueue() {
  while (unfollowQueue.length > 0) {
    const user = unfollowQueue.shift();
    const remaining = unfollowQueue.length;
    
    console.log(`Удаляем: ${user.username} (осталось: ${remaining})`);
    
    try {
      const tab = await chrome.tabs.create({
        url: user.profileUrl,
        active: true
      });
      
      console.log(`Открыта вкладка #${tab.id}`);
      
      // Ждем загрузки - 10 секунд
      await sleep(10000);
      
      // Кликаем кнопку
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const button = document.querySelector('[data-test="friend-added-button"]');
          if (button) {
            button.click();
            return true;
          }
          return false;
        }
      });
      
      const clicked = results[0]?.result || false;
      
      if (clicked) {
        console.log(`Кнопка кликнута`);
        await sleep(5000); // Ждем подтверждения
      } else {
        console.log(`Кнопка не найдена`);
      }
      
      // Закрываем вкладку
      await chrome.tabs.remove(tab.id);
      console.log(`Вкладка закрыта`);
      
    } catch (error) {
      console.log(`Ошибка: ${error.message}`);
    }
    
    // Пауза между пользователями - 2 секунды
    if (unfollowQueue.length > 0) {
      await sleep(2000);
    }
  }
  
  isProcessing = false;
  console.log('Удаление завершено');
}