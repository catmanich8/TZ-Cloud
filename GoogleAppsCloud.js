/**
 * Google Apps Script для облачного сохранения ТЗ
 * SEO Subdomain Automation Suite v4.5.6
 * 
 * Каждая задача создаёт ОТДЕЛЬНУЮ таблицу
 * Формат имени: домен - задача [ответственный]
 * 
 * v4.5.6: Таблицы доступны по ссылке БЕЗ логина в Google
 * 
 * ИНСТРУКЦИЯ ПО НАСТРОЙКЕ:
 * 
 * 1. Откройте https://script.google.com
 * 2. Создайте новый проект (New project)
 * 3. Удалите весь код и вставьте этот скрипт
 * 4. Сохраните (Ctrl+S)
 * 5. Deploy → New deployment
 * 6. Выберите тип: Web app
 * 7. Execute as: Me
 * 8. Who has access: Anyone
 * 9. Deploy
 * 10. Скопируйте Web app URL
 * 11. Вставьте URL в настройки скрипта (🔧 → Облако)
 */

// Папка для сохранения ТЗ (ID папки в Google Drive, оставьте пустым для корня)
const FOLDER_ID = '1TLiEMoMCinlkdHTxM4MrLU2JzIR7khI-';

/**
 * Обработка POST запросов от userscript
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const tasks = data.tasks;
    
    if (!tasks || !tasks.length) {
      return createResponse({ success: false, error: 'Нет задач для сохранения' });
    }
    
    const createdSheets = [];
    
    // Создаём ОТДЕЛЬНУЮ таблицу для каждой задачи
    tasks.forEach((task, index) => {
      // v4.5.2: Используем sheetName из userscript (формат: домен - задача [ответственный])
      // Если sheetName не передан, формируем по старой логике
      let spreadsheetName;
      
      if (task.sheetName) {
        // Новый формат из userscript
        spreadsheetName = task.sheetName.substring(0, 100).replace(/[\\/*?:\[\]]/g, '_');
      } else {
        // Fallback: старый формат
        const taskName = task.taskName || task.domain || `Задача_${index + 1}`;
        spreadsheetName = taskName.substring(0, 100).replace(/[\\/*?:\[\]]/g, '_');
      }
      
      // Создаём таблицу
      const ss = SpreadsheetApp.create(spreadsheetName);
      
      // Перемещаем в папку если указана
      if (FOLDER_ID) {
        try {
          const file = DriveApp.getFileById(ss.getId());
          const folder = DriveApp.getFolderById(FOLDER_ID);
          folder.addFile(file);
          DriveApp.getRootFolder().removeFile(file);
          
          // v4.5.6: Делаем таблицу доступной по ссылке без логина
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (err) {
          console.log('Не удалось переместить в папку: ' + err);
        }
      } else {
        // Если папка не указана - всё равно делаем публичной
        try {
          const file = DriveApp.getFileById(ss.getId());
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch (err) {
          console.log('Не удалось установить доступ: ' + err);
        }
      }
      
      // Получаем первый лист и переименовываем
      const sheet = ss.getSheets()[0];
      sheet.setName('ТЗ');
      
      // Записываем ТЗ
      if (task.tzContent) {
        // Обрабатываем переносы строк (могут прийти как \n или как \\n)
        const normalizedContent = task.tzContent
          .replace(/\\n/g, '\n')  // Заменяем экранированные переносы на реальные
          .replace(/\\t/g, '\t'); // Заменяем экранированные табы
        const tzLines = normalizedContent.split('\n');
        const tzData = tzLines.map(line => [line]);
        if (tzData.length > 0) {
          sheet.getRange(1, 1, tzData.length, 1).setValues(tzData);
        }
      }
      
      // Форматирование
      sheet.setColumnWidth(1, 800);
      sheet.getRange('A1').setFontWeight('bold').setFontSize(14);
      
      createdSheets.push({
        name: spreadsheetName,
        url: ss.getUrl(),
        task: task.taskName,
        domain: task.domain
      });
    });
    
    // Возвращаем ссылку на первую таблицу (или на все)
    return createResponse({
      success: true,
      sheetUrl: createdSheets[0].url,
      sheetName: createdSheets[0].name,
      sheetsCount: createdSheets.length,
      sheets: createdSheets,
      message: `Создано таблиц: ${createdSheets.length}`
    });
    
  } catch (error) {
    return createResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * Обработка GET запросов (для проверки подключения)
 */
function doGet(e) {
  return createResponse({
    success: true,
    message: 'SEO TZ Cloud API работает ✓',
    version: '4.5.6',
    mode: 'Каждая задача = отдельная таблица',
    format: 'домен - задача [ответственный]',
    access: 'Публичный (без логина)'
  });
}

/**
 * Создание JSON ответа
 */
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Тестовая функция (запустите вручную для проверки)
 */
function testCreateSheet() {
  const testData = {
    tasks: [
      {
        sheetName: 'example.com - Смена поддомена [Timur]',
        taskName: 'Смена поддомена',
        domain: 'example.com',
        tzContent: 'ТЕСТОВОЕ ТЗ\n\n1) Первый пункт\n2) Второй пункт\n\n--- Дополнительно ---\nПриоритет: high'
      },
      {
        sheetName: 'test.com - Отключение 404',
        taskName: 'Отключение 404',
        domain: 'test.com',
        tzContent: 'Отключение поддомена\n\nПоставить 404'
      }
    ]
  };
  
  // Симулируем POST запрос
  const result = doPost({ postData: { contents: JSON.stringify(testData) } });
  Logger.log(result.getContent());
}
