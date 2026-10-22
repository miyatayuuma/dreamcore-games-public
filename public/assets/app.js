const grid = document.querySelector('#games-grid');
const count = document.querySelector('#games-count');
const worksGrid = document.querySelector('#works-grid');
const worksCount = document.querySelector('#works-count');

const statuses = {
  ready: { label: 'あそべる', action: 'あそぶ' },
  planned: { label: 'じゅんび中', action: 'もうすぐあそべるよ' }
};
const accentNames = new Set(['coral', 'mint', 'violet', 'blue', 'yellow']);


function coverFor(entry, ready, eager = false) {
  const cover = document.createElement('div');
  cover.className = 'game-cover';
  if (/^[a-z0-9-]+$/.test(entry.id)) cover.classList.add('cover--' + entry.id);
  const emoji = document.createElement('span');
  emoji.className = 'game-cover-icon';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = entry.emoji || '🎮';
  cover.append(emoji);
  // Only local, catalogued artwork is accepted. The link text names the work.
  if (typeof entry.cover === 'string' && /^(games|works|covers)\/[a-z0-9/_-]+\.(png|jpe?g|webp|svg)$/i.test(entry.cover)) {
    const img = document.createElement('img');
    img.className = 'game-cover-art';
    img.src = './' + entry.cover;
    img.alt = '';
    img.decoding = 'async';
    img.loading = eager ? 'eager' : 'lazy';
    if (eager) img.fetchPriority = 'high';
    img.addEventListener('load', () => {
      // Avoid showing an undecoded blank image while painting a full-page
      // screenshot or scrolling rapidly through the gallery.
      if (typeof img.decode === 'function') {
        img.decode().then(
          () => cover.classList.add('has-image'),
          () => cover.classList.add('is-fallback')
        );
      } else {
        cover.classList.add('has-image');
      }
    }, { once: true });
    img.addEventListener('error', () => cover.classList.add('is-fallback'), { once: true });
    cover.append(img);
  } else {
    cover.classList.add('is-fallback');
  }
  if (!ready) {
    const state = document.createElement('span');
    state.className = 'game-state';
    state.textContent = statuses[entry.status]?.label || 'じゅんび中';
    cover.append(state);
  }
  return cover;
}

function gameCard(game, eager = false) {
  const playable = game.status === 'ready';
  const card = document.createElement(playable ? 'a' : 'article');
  card.className = 'game-card' + (playable ? '' : ' is-pending');
  if (game.featured === true && playable) card.classList.add('is-featured');
  card.dataset.accent = accentNames.has(game.accent) ? game.accent : 'coral';
  if (playable) {
    card.href = './play.html?game=' + encodeURIComponent(game.id);
    card.setAttribute('aria-label', game.title + 'をあそぶ');
  }

  const cover = coverFor(game, playable, eager);
  const body = document.createElement('div');
  body.className = 'game-body';
  const category = document.createElement('span');
  category.className = 'game-category';
  category.textContent = game.category || 'ミニゲーム';
  const title = document.createElement('h3');
  title.className = 'game-title';
  title.textContent = game.title;
  const description = document.createElement('p');
  description.className = 'game-description';
  description.textContent = game.description || '';
  const action = document.createElement('div');
  action.className = 'game-action';
  const actionLabel = document.createElement('span');
  actionLabel.textContent = statuses[game.status].action;
  const arrow = document.createElement('span');
  arrow.className = 'game-action-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = playable ? '→' : '…';
  action.append(actionLabel, arrow);
  body.append(category, title, description, action);
  card.append(cover, body);
  return card;
}

function workCard(work) {
  const ready = work.status === 'ready';
  const card = document.createElement(ready ? 'a' : 'article');
  card.className = 'work-card' + (ready ? '' : ' is-pending');
  card.dataset.accent = accentNames.has(work.accent) ? work.accent : 'violet';
  if (ready) {
    card.href = './play.html?work=' + encodeURIComponent(work.id);
    card.setAttribute('aria-label', work.title + 'をみる');
  }
  const cover = coverFor(work, ready, true);
  const body = document.createElement('div');
  body.className = 'game-body';
  const category = document.createElement('span');
  category.className = 'game-category';
  category.textContent = work.category || '映像作品';
  const title = document.createElement('h3');
  title.className = 'game-title';
  title.textContent = work.title;
  const description = document.createElement('p');
  description.className = 'game-description';
  description.textContent = work.description || '';
  const action = document.createElement('div');
  action.className = 'game-action';
  const label = document.createElement('span');
  label.textContent = ready ? 'みる' : '公開準備中';
  const arrow = document.createElement('span');
  arrow.className = 'game-action-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = ready ? '→' : '…';
  action.append(label, arrow);
  body.append(category, title, description, action);
  card.append(cover, body);
  return card;
}

async function init() {
  try {
    const response = await fetch('./games/catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Catalog request failed: ' + response.status);
    const catalog = await response.json();
    if (!Array.isArray(catalog.games)) throw new Error('Invalid game catalog');
    const games = catalog.games.filter(game =>
      game && typeof game.id === 'string' &&
      typeof game.title === 'string' &&
      Object.hasOwn(statuses, game.status)
    );
    grid.replaceChildren();
    if (!games.length) {
      const msg = document.createElement('p');
      msg.className = 'library-message';
      msg.textContent = 'ゲームはまだとうろくされていません。';
      grid.append(msg);
    } else {
      const featured = games.find(game => game.featured === true && game.status === 'ready');
      const ordered = featured ? [featured, ...games.filter(game => game !== featured)] : games;
      ordered.forEach((game, i) => grid.append(gameCard(game, i < 3)));
    }
    const ready = games.filter(game => game.status === 'ready').length;
    count.textContent = ready + 'こ あそべる';
    const works = (Array.isArray(catalog.works) ? catalog.works : []).filter(work =>
      work && typeof work.id === 'string' &&
      typeof work.title === 'string' && Object.hasOwn(statuses, work.status)
    );
    worksGrid.replaceChildren(...works.map(workCard));
    if (!works.length) {
      const msg = document.createElement('p');
      msg.className = 'library-message';
      msg.textContent = '作品はまだありません。';
      worksGrid.append(msg);
    }
    worksCount.textContent = works.filter(work => work.status === 'ready').length + '作品';
  } catch (error) {
    console.error('Unable to load mini-game catalog', error);
    grid.replaceChildren();
    const msg = document.createElement('p');
    msg.className = 'library-message';
    msg.textContent = 'ゲームのリストをよみこめませんでした。ページをこうしんしてください。';
    grid.append(msg);
    count.textContent = 'よみこみエラー';
    worksGrid.textContent = '作品をよみこめませんでした。';
    worksCount.textContent = 'よみこみエラー';
  } finally {
    grid.setAttribute('aria-busy', 'false');
    worksGrid.setAttribute('aria-busy', 'false');
  }
}

init();