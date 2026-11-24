'use strict';

// Расписание загружается из двух JSON-файлов асинхронно.
// Имеющиеся фильтры сохраняются и восстанавливаются через Cookies.
const SCHEDULE_COOKIE = 'ajax_hub_schedule_filters';
const DAY_NAMES = ['','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];

const field = {
    subject: document.getElementById('schedule-subject'),
    course: document.getElementById('schedule-course'),
    group: document.getElementById('schedule-group'),
    day: document.getElementById('schedule-day'),
    week: document.getElementById('schedule-week')
};
const listElement = document.getElementById('schedule-list');
const statusElement = document.getElementById('schedule-status');
const summaryElement = document.getElementById('schedule-summary');
const weekLabel = document.getElementById('schedule-week-label');
const weekNumber = document.getElementById('schedule-week-number');
const weekInfo = document.getElementById('schedule-week-info');
const dateLabel = document.getElementById('schedule-date');

let scheduleData = null;
let bellsData = null;
let previousRestored = {};

function isoDateAsUtc(date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function thisWeekMonday() {
    const today = new Date();
    const day = (today.getDay() + 6) % 7;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - day);
}

function currentWeekday() {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
}

function selectedCalendarDate(day) {
    const monday = thisWeekMonday();
    return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day - 1);
}

function weekFor(date) {
    const anchor = new Date(scheduleData.anchorDate + 'T00:00:00');
    const weekIndex = Math.floor((isoDateAsUtc(date) - isoDateAsUtc(anchor)) / (7 * 86400000));
    const isUpper = (weekIndex % 2 === 0) === (scheduleData.anchorWeek === 'upper');
    return {number: weekIndex + 1, type: isUpper ? 'upper' : 'lower'};
}

function getFilters() {
    return Object.fromEntries(Object.entries(field).map(([key, control]) => [key, control.value]));
}

function saveFilters() {
    AjaxHub.saveCookie(SCHEDULE_COOKIE, getFilters(), 30);
}

function restoreFilters() {
    const stored = AjaxHub.readCookie(SCHEDULE_COOKIE);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
    for (const [key, value] of Object.entries(stored)) {
        if (!(key in field) || typeof value !== 'string') continue;
        const control = field[key];
        if (control.tagName === 'SELECT') {
            const hasOption = [...control.options].some(option => option.value === value);
            if (!hasOption) continue;
        }
        control.value = value;
        previousRestored[key] = value;
        control.classList.add('restored-filter');
        control.title = 'Значение восстановлено из Cookies';
    }
}

function setupGroupOptions() {
    const groups = scheduleData.groups;
    const courses = [...new Set(groups.map(group => group.course))].sort((a, b) => a - b);
    field.course.replaceChildren();
    for (const course of courses) {
        const option = document.createElement('option');
        option.value = String(course);
        option.textContent = `${course} курс`;
        field.course.append(option);
    }
    field.group.replaceChildren();
    for (const group of groups) {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        field.group.append(option);
    }
}

function makeText(tag, content, className = '') {
    const element = document.createElement(tag);
    element.textContent = content;
    if (className) element.className = className;
    return element;
}

function makeDetail(label, text) {
    const container = document.createElement('div');
    container.className = 'schedule-detail';
    container.append(makeText('dt', label));
    container.append(makeText('dd', text));
    return container;
}

function closeOtherLessons(current) {
    for (const card of listElement.querySelectorAll('.schedule-card.expanded')) {
        if (card === current) continue;
        card.classList.remove('expanded');
        card.querySelector('.schedule-toggle').setAttribute('aria-expanded', 'false');
        card.querySelector('.schedule-details').hidden = true;
    }
}

function renderLesson(lesson) {
    const times = bellsData[String(lesson.pair)];
    const card = document.createElement('article');
    card.className = 'schedule-card';

    const time = document.createElement('div');
    time.className = 'schedule-time';
    time.append(makeText('strong', times.start));
    time.append(makeText('span', times.end));
    time.append(makeText('small', `${lesson.pair}-я пара`));

    const main = document.createElement('div');
    main.className = 'schedule-card-main';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'schedule-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `Подробности: ${lesson.subject}`);

    const textBlock = document.createElement('span');
    textBlock.className = 'schedule-title-block';
    textBlock.append(makeText('strong', lesson.subject));
    const tags = document.createElement('span');
    tags.className = 'schedule-tags';
    tags.append(makeText('span', lesson.kind, 'schedule-tag'));
    tags.append(makeText('span', lesson.mode, 'schedule-tag' + (lesson.mode === 'Онлайн' ? ' online' : '')));
    textBlock.append(tags);
    toggle.append(textBlock);
    toggle.insertAdjacentHTML('beforeend', '<svg class="schedule-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>');

    const details = document.createElement('div');
    details.className = 'schedule-details';
    details.hidden = true;
    const grid = document.createElement('dl');
    grid.className = 'schedule-detail-grid';
    grid.append(makeDetail('Преподаватель', lesson.teacher || 'Не указан'));
    grid.append(makeDetail('Кабинет / формат', lesson.mode === 'Онлайн' ? 'Онлайн' : (lesson.room || 'Не указан')));
    grid.append(makeDetail('Тип занятия', lesson.kind));
    if (lesson.position) grid.append(makeDetail('Должность', lesson.position));
    if (lesson.department) grid.append(makeDetail('Кафедра', lesson.department));
    if (lesson.note) grid.append(makeDetail('Примечание', lesson.note));
    details.append(grid);

    toggle.addEventListener('click', () => {
        const shouldOpen = details.hidden;
        closeOtherLessons(card);
        details.hidden = !shouldOpen;
        card.classList.toggle('expanded', shouldOpen);
        toggle.setAttribute('aria-expanded', String(shouldOpen));
    });

    main.append(toggle, details);
    card.append(time, main);
    return card;
}

function renderSchedule() {
    if (!scheduleData || !bellsData) return;
    const filters = getFilters();
    const group = scheduleData.groups.find(g => g.id === filters.group && String(g.course) === filters.course);
    const date = selectedCalendarDate(Number(filters.day));
    const week = weekFor(date);
    const chosenWeek = filters.week === 'auto' ? week.type : filters.week;
    const dayLessons = group ? (scheduleData.weeks[chosenWeek][filters.day] || []) : [];

    const tokens = filters.subject.toLocaleLowerCase('ru-RU').trim().split(/\s+/).filter(Boolean);
    const visible = dayLessons.filter(lesson => {
        const subject = lesson.subject.toLocaleLowerCase('ru-RU');
        return tokens.every(token => subject.includes(token));
    }).sort((a,b) => a.pair - b.pair);

    const longDate = new Intl.DateTimeFormat('ru-RU', {weekday:'long',day:'numeric',month:'long'}).format(date);
    dateLabel.textContent = longDate.charAt(0).toUpperCase() + longDate.slice(1);
    weekLabel.textContent = chosenWeek === 'upper' ? 'Верхняя неделя' : 'Нижняя неделя';
    weekNumber.textContent = week.number >= 1 ? `Учебная неделя № ${week.number}` : 'До начала семестра';
    weekInfo.title = week.number >= 1 ? `Учебная неделя № ${week.number} (отсчёт с ${scheduleData.anchorDate})` : 'Учебный семестр ещё не начался';
    summaryElement.textContent = `${DAY_NAMES[Number(filters.day)]} · ${visible.length} ${wordLessons(visible.length)}`;

    listElement.replaceChildren();
    if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'schedule-empty';
        empty.append(makeText('strong', 'Занятий не найдено'));
        empty.append(makeText('span', tokens.length ? 'Измени запрос или фильтры.' : 'На выбранный день занятия не запланированы.'));
        listElement.append(empty);
    } else {
        for (const lesson of visible) listElement.append(renderLesson(lesson));
    }
    statusElement.textContent = '';
}

function wordLessons(count) {
    if (count % 100 >= 11 && count % 100 <= 14) return 'занятий';
    if (count % 10 === 1) return 'занятие';
    if (count % 10 >= 2 && count % 10 <= 4) return 'занятия';
    return 'занятий';
}

async function initSchedule() {
    try {
        const [scheduleResponse, bellsResponse] = await Promise.all([
            fetch('data/schedule.json'), fetch('data/bells.json')
        ]);
        if (!scheduleResponse.ok || !bellsResponse.ok) throw new Error('Не удалось получить данные расписания.');
        [scheduleData, bellsData] = await Promise.all([scheduleResponse.json(), bellsResponse.json()]);
        setupGroupOptions();
        field.day.value = String(currentWeekday());
        restoreFilters();

        for (const [name, control] of Object.entries(field)) {
            control.addEventListener(name === 'subject' ? 'input' : 'change', () => {
                control.classList.remove('restored-filter');
                if (control.title === 'Значение восстановлено из Cookies') control.removeAttribute('title');
                saveFilters();
                renderSchedule();
            });
        }
        renderSchedule();
    } catch (error) {
        console.error(error);
        statusElement.textContent = `${error.message} Проверь подключение XAMPP и файлы data/*.json.`;
    }
}

initSchedule();
