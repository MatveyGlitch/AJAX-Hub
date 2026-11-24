// Задание №1: AJAX-поиск, подгрузка, сортировка и Cookies.

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const searchSort = document.getElementById('search-sort');
const searchButton = document.getElementById('search-button');
const searchStatus = document.getElementById('search-status');
const resultsList = document.getElementById('results-list');
const loadMoreButton = document.getElementById('load-more');
const featuredNews = document.getElementById('featured-news');

const COOKIE_NAME = 'ajax_hub_last_search';
const PAGE_SIZE = 10;

let currentItems = [];
let totalItems = 0;
let requestNumber = 0;
let busy = false;

function saveSearch() {
    AjaxHub.saveCookie(COOKIE_NAME, {
        query: searchInput.value.trim(),
        sort: searchSort.value,
        total: totalItems,
        items: currentItems.map(({ id, nickname }) => ({ id, nickname }))
    });
}

function renderSearch() {
    resultsList.replaceChildren();

    for (const item of currentItems) {
        const row = document.createElement('li');
        row.className = `result-item${item.restored ? ' restored' : ''}`;

        const avatar = document.createElement('span');
        avatar.className = 'result-avatar';
        avatar.textContent = item.nickname.slice(0, 1).toUpperCase();
        avatar.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'result-name';
        name.textContent = item.nickname;

        const meta = document.createElement('span');
        meta.className = 'result-meta';
        meta.textContent = item.restored ? 'Из Cookies' : `#${item.id}`;

        row.append(avatar, name, meta);
        resultsList.append(row);
    }

    if (totalItems === 0) {
        searchStatus.textContent = 'По вашему запросу ничего не найдено.';
    } else {
        searchStatus.textContent = `Показано ${currentItems.length} из ${totalItems}`;
    }

    loadMoreButton.hidden = currentItems.length >= totalItems;
}

async function search(reset = true) {
    if (busy) {
        return;
    }

    busy = true;
    searchButton.disabled = true;
    loadMoreButton.disabled = true;

    const request = ++requestNumber;
    const query = searchInput.value.trim();
    const sort = searchSort.value;
    const offset = reset ? 0 : currentItems.length;

    if (reset) {
        searchStatus.textContent = 'Выполняется поиск...';
    } else {
        searchStatus.textContent = 'Загружаются дополнительные результаты...';
    }

    try {
        const response = await AjaxHub.post({
            type: 'nickname',
            query,
            sort,
            offset,
            limit: PAGE_SIZE
        });

        if (request !== requestNumber) {
            return;
        }

        const newItems = response.items.map(item => ({ ...item, restored: false }));
        currentItems = reset ? newItems : [...currentItems, ...newItems];
        totalItems = response.total;

        renderSearch();
        saveSearch();
    } catch (error) {
        searchStatus.textContent = `Ошибка: ${error.message}`;
        if (reset) {
            currentItems = [];
            totalItems = 0;
            resultsList.replaceChildren();
            loadMoreButton.hidden = true;
        }
    } finally {
        busy = false;
        searchButton.disabled = false;
        loadMoreButton.disabled = false;
    }
}

function restoreSearch() {
    const saved = AjaxHub.readCookie(COOKIE_NAME);

    if (!saved || !Array.isArray(saved.items) ||
        !Number.isInteger(saved.total) || saved.total < 0 ||
        !['asc', 'desc'].includes(saved.sort)) {
        return false;
    }

    searchInput.value = typeof saved.query === 'string' ? saved.query : '';
    searchSort.value = saved.sort;
    currentItems = saved.items
        .filter(item => typeof item.nickname === 'string' && Number.isInteger(item.id))
        .map(item => ({ ...item, restored: true }));
    totalItems = saved.total;
    renderSearch();

    return true;
}

// Редакционные изображения из согласованного макета.
const featured = [
    { id: 2, image: 'assets/ajax-code.png', category: 'ТЕХНОЛОГИИ' },
    { id: 1, image: 'assets/data-wave.png', category: 'ВЕБ-РАЗРАБОТКА' },
    { id: 4, image: 'assets/campus.png', category: 'НОВОСТИ' },
    { id: 13, image: 'assets/coding-practice.png', category: 'AJAX' },
    { id: 11, image: 'assets/resources.png', category: 'ИНСТРУМЕНТЫ' },
    { id: null, image: 'assets/schedule.png', category: 'РАСПИСАНИЕ', title: 'Расписание занятий', preview: 'Поиск занятий по предмету, курсу и группе.', href: 'schedule.html' }
];

async function renderFeaturedNews() {
    try {
        const response = await AjaxHub.post({ type: 'news', offset: 0, limit: 50 });
        const lookup = new Map(response.items.map(item => [item.id, item]));
        featuredNews.replaceChildren();

        for (const config of featured) {
            const item = config.id === null ? null : lookup.get(config.id);
            if (config.id !== null && !item) {
                continue;
            }

            const card = document.createElement('a');
            card.className = 'featured-card';
            card.href = config.href || `news.html?id=${encodeURIComponent(item.id)}`;

            const image = document.createElement('img');
            image.src = config.image;
            image.alt = '';
            image.loading = 'lazy';

            const info = document.createElement('div');
            info.className = 'featured-body';

            const category = document.createElement('span');
            category.className = 'featured-category';
            category.textContent = config.category;

            const heading = document.createElement('h3');
            heading.textContent = config.title || item.title;

            const description = document.createElement('p');
            description.textContent = config.preview || item.preview;

            info.append(category, heading, description);
            card.append(image, info);
            featuredNews.append(card);
        }
    } catch (error) {
        const message = document.createElement('p');
        message.className = 'results-status';
        message.textContent = `Не удалось загрузить новости: ${error.message}`;
        featuredNews.replaceChildren(message);
    }
}

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    search(true);
});

searchSort.addEventListener('change', () => search(true));
loadMoreButton.addEventListener('click', () => search(false));

if (!restoreSearch()) {
    search(true);
}

renderFeaturedNews();
