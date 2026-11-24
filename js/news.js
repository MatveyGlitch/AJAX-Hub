// Задание №2: POST/AJAX, новости по пять записей, поиск, сортировка, модальное окно.
// Дополнительное задание: поиск по нескольким словам и восстановление результатов из Cookies.

const newsForm = document.getElementById('news-search-form');
const newsInput = document.getElementById('news-search-input');
const newsSort = document.getElementById('news-sort');
const newsSearchButton = document.getElementById('news-search-button');
const newsStatus = document.getElementById('news-status');
const newsList = document.getElementById('news-list');
const newsPagination = document.getElementById('news-pagination');

const newsModal = document.getElementById('news-modal');
const newsModalClose = document.getElementById('news-modal-close');
const modalTitle = document.getElementById('modal-news-title');
const modalDate = document.getElementById('modal-news-date');
const modalContent = document.getElementById('modal-news-content');
const modalImage = document.getElementById('modal-news-image');

const NEWS_COOKIE = 'ajax_hub_news_search';
const NEWS_PAGE_SIZE = 6;
// Каждой из 15 новостей назначена отдельная иллюстрация по её ID.
// Используем ID, а не индекс в списке: при сортировке и поиске изображения не меняются местами.
const newsImages = {
    1: 'assets/data-wave.png',
    2: 'assets/ajax-code.png',
    3: 'assets/ai-assistant.png',
    4: 'assets/campus.png',
    5: 'assets/web-security.png',
    6: 'assets/json-javascript.png',
    7: 'assets/learning-portal.png',
    8: 'assets/php-applications.png',
    9: 'assets/planning-calendar.png',
    10: 'assets/browser-storage.png',
    11: 'assets/resources.png',
    12: 'assets/schedule.png',
    13: 'assets/coding-practice.png',
    14: 'assets/search-filter.png',
    15: 'assets/future-web.png'
};

function newsImage(id) {
    return newsImages[id] || 'assets/ajax-code.png';
}

let newsItems = [];
let newsTotal = 0;
let newsPage = 1;
let lastRequest = 0;
let lastFocusedElement = null;
let modalRequest = 0;
let searchDebounce;

function makeElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
}

function renderNews() {
    newsList.replaceChildren();

    for (let index = 0; index < newsItems.length; index++) {
        const item = newsItems[index];
        const card = makeElement('article', `news-card${item.restored ? ' news-card-restored' : ''}`);

        const photo = makeElement('div', 'news-card-image');
        const img = document.createElement('img');
        img.src = newsImage(item.id);
        img.alt = '';
        img.loading = 'lazy';
        photo.append(img);

        const body = makeElement('div', 'news-card-content');
        const meta = makeElement('div', 'news-card-meta');
        meta.append(makeElement('span', '', item.date || ''));
        if (item.restored) meta.append(makeElement('span', 'news-cookie-tag', 'Из Cookies'));

        const heading = makeElement('h3', '', item.title);
        const preview = makeElement('p', 'news-card-preview', item.preview);
        const readButton = makeElement('button', 'news-read-more', 'Читать больше');
        readButton.type = 'button';
        readButton.addEventListener('click', () => openNews(item.id));

        body.append(meta, heading, preview, readButton);
        card.append(photo, body);
        newsList.append(card);
    }

    if (newsTotal === 0) {
        newsStatus.textContent = 'По вашему запросу новости не найдены.';
    } else {
        const from = (newsPage - 1) * NEWS_PAGE_SIZE + 1;
        const to = from + newsItems.length - 1;
        newsStatus.textContent = `Показано ${from}–${to} из ${newsTotal}`;
    }
    renderPagination();
}

function renderPagination() {
    newsPagination.replaceChildren();
    const pages = Math.ceil(newsTotal / NEWS_PAGE_SIZE);
    if (pages <= 1) return;

    function addButton(text, destination, current = false) {
        const button = makeElement('button', `page-button${current ? ' current' : ''}`, text);
        button.type = 'button';
        button.disabled = current;
        if (current) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
            loadNews(destination).then(() => {
                document.getElementById('publications').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
        newsPagination.append(button);
    }

    if (newsPage > 1) addButton('← Назад', newsPage - 1);
    for (let page = 1; page <= pages; page++) addButton(String(page), page, page === newsPage);
    if (newsPage < pages) addButton('Вперёд →', newsPage + 1);
}

function saveNewsCookie() {
    // Сохраняем только краткие данные: одна Cookie ограничена по размеру (~4 КБ).
    const cache = newsItems.map(item => ({
        id: item.id,
        title: item.title,
        preview: item.preview.slice(0, 55),
        date: item.date
    }));
    AjaxHub.saveCookie(NEWS_COOKIE, {
        query: newsInput.value.trim(),
        sort: newsSort.value,
        page: newsPage,
        total: newsTotal,
        items: cache
    });
}

function restoreNewsCookie() {
    const data = AjaxHub.readCookie(NEWS_COOKIE);
    if (!data || typeof data.query !== 'string' ||
        !['asc', 'desc'].includes(data.sort) ||
        !Number.isInteger(data.page) || data.page < 1 ||
        !Number.isInteger(data.total) || data.total < 0 ||
        !Array.isArray(data.items) || data.items.length > NEWS_PAGE_SIZE ||
        !data.items.every(item => Number.isInteger(item.id) &&
            typeof item.title === 'string' && typeof item.preview === 'string')) {
        return null;
    }

    newsInput.value = data.query;
    newsSort.value = data.sort;
    newsPage = data.page;
    newsTotal = data.total;
    newsItems = data.items.map(item => ({ ...item, restored: true }));
    renderNews();
    return data;
}

async function loadNews(page = 1, restoredIds = null) {
    const request = ++lastRequest;
    const query = newsInput.value.trim();
    const sort = newsSort.value;
    newsStatus.textContent = 'Загрузка новостей...';
    newsSearchButton.disabled = true;

    try {
        const result = await AjaxHub.post({
            type: 'news',
            query,
            sort,
            offset: (page - 1) * NEWS_PAGE_SIZE,
            limit: NEWS_PAGE_SIZE
        });
        if (request !== lastRequest) return;

        newsPage = page;
        newsTotal = result.total;
        newsItems = result.items.map(item => ({
            ...item,
            restored: restoredIds ? restoredIds.has(item.id) : false
        }));
        renderNews();
        saveNewsCookie();
    } catch (error) {
        if (request !== lastRequest) return;
        newsStatus.textContent = `Ошибка загрузки: ${error.message}`;
        if (newsItems.length === 0) {
            newsList.replaceChildren();
            newsPagination.replaceChildren();
        }
    } finally {
        if (request === lastRequest) newsSearchButton.disabled = false;
    }
}

function updateNewsSearch() {
    clearTimeout(searchDebounce);
    loadNews(1);
}

newsForm.addEventListener('submit', event => {
    event.preventDefault();
    updateNewsSearch();
});
newsInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadNews(1), 350);
});
newsSort.addEventListener('change', updateNewsSearch);

async function openNews(id) {
    lastFocusedElement = document.activeElement;
    newsModal.hidden = false;
    document.body.classList.add('modal-open');
    modalTitle.textContent = 'Загрузка новости...';
    modalDate.textContent = '';
    modalContent.textContent = 'Загрузка полного текста...';
    // Иллюстрацию определяем по ID, даже если новость открыта по ссылке с главной.
    modalImage.src = newsImage(id);
    modalImage.alt = '';
    newsModalClose.focus();

    const current = ++modalRequest;
    try {
        // По условию полный текст запрашивается только при открытии модального окна.
        const result = await AjaxHub.post({ type: 'news', id });
        if (current !== modalRequest) return;
        modalTitle.textContent = result.item.title;
        modalDate.textContent = result.item.date;
        modalContent.textContent = result.item.content;
    } catch (error) {
        if (current === modalRequest) {
            modalTitle.textContent = 'Не удалось загрузить новость';
            modalContent.textContent = error.message;
        }
    }
}

function closeNews() {
    if (newsModal.hidden) return;
    ++modalRequest;
    newsModal.hidden = true;
    document.body.classList.remove('modal-open');
    lastFocusedElement?.focus();
    const url = new URL(window.location.href);
    if (url.searchParams.has('id')) {
        url.searchParams.delete('id');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
}

newsModalClose.addEventListener('click', closeNews);
newsModal.querySelector('[data-close-modal]').addEventListener('click', closeNews);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNews();
    if (event.key === 'Tab' && !newsModal.hidden) {
        // В модальном окне единственная кнопка — закрытие.
        event.preventDefault();
        newsModalClose.focus();
    }
});

const savedNews = restoreNewsCookie();
const restoredIds = savedNews ? new Set(savedNews.items.map(item => item.id)) : null;
loadNews(savedNews ? savedNews.page : 1, restoredIds).then(() => {
    const id = Number(new URLSearchParams(location.search).get('id'));
    if (Number.isInteger(id) && id > 0) openNews(id);
});
