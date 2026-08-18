/**
 * Study view — the swipeable card stack.
 *
 * Gestures: left = Again, right = Good, up = Easy, down = Hard.
 * The round star button is the primary Easy control; the swipe-up is a bonus
 * for people who find it.
 */

import { el, clear, haptic, toast, formatPercent } from '../ui.js';
import { icon } from '../icons.js';
import { Rating, State, retrievability } from '../fsrs.js';
import {
  buildQueue, applyReview, previewAll, formatInterval, DAY, dayIndex,
} from '../scheduler.js';
import { commitReview, cardsForDeck, reviewsForDeck } from '../store.js';
import { currentSettings } from '../settings.js';

const GHOST_COUNT = 2;

export async function openStudy(deck, { onExit }) {
  const settings = currentSettings();
  const [cards, reviews] = await Promise.all([
    cardsForDeck(deck.id),
    reviewsForDeck(deck.id),
  ]);

  const todayIdx = dayIndex(Date.now(), settings.dayCutoffHour);
  const doneToday = { new: 0, review: 0 };
  for (const r of reviews) {
    if (dayIndex(r.ts, settings.dayCutoffHour) !== todayIdx) continue;
    if (r.stateBefore === State.New) doneToday.new++;
    else if (r.stateBefore === State.Review) doneToday.review++;
  }

  const queue = buildQueue(cards, settings, Date.now(), doneToday);
  const session = new StudySession({ deck, queue, settings, onExit });
  session.mount();
  return session;
}

class StudySession {
  constructor({ deck, queue, settings, onExit }) {
    this.deck = deck;
    this.settings = settings;
    this.onExit = onExit;

    // Interleave new cards into the review stream rather than front-loading
    // them: a wall of 20 unknown cards is the fastest way to quit a session.
    this.pending = interleave(queue.learning, queue.review, queue.new);
    this.initialTotal = this.pending.length;

    this.stats = { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0, startedAt: Date.now() };
    this.history = [];        // for undo
    this.revealed = false;
    this.cardShownAt = 0;
    this.animating = false;
  }

  mount() {
    document.body.classList.add('is-studying');
    this.root = el('div', { class: 'study' });
    document.body.appendChild(this.root);
    this.render();
  }

  destroy() {
    document.body.classList.remove('is-studying');
    this.root?.remove();
  }

  exit() {
    this.destroy();
    this.onExit?.(this.stats);
  }

  /* ------------------------------------------------------------------ */

  get current() {
    return this.pending[0] || null;
  }

  render() {
    clear(this.root);

    if (!this.current) {
      this.root.appendChild(this.renderSummary());
      return;
    }

    this.root.appendChild(this.renderTopBar());
    this.root.appendChild(this.renderProgress());

    this.stage = el('div', { class: 'study__stage' });
    this.root.appendChild(this.stage);

    this.renderStack();
    this.renderActionArea();

    this.cardShownAt = performance.now();
  }

  renderTopBar() {
    const counts = countByState(this.pending);
    const bar = el('div', { class: 'study__top' }, [
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Close session',
        onclick: () => this.exit(),
      }, [icon('close')]),
      el('div', { class: 'study__counts' }, [
        el('span', {
          class: `count count--new${counts.new ? '' : ' is-empty'}`,
          text: String(counts.new),
          title: 'New cards left',
        }),
        el('span', {
          class: `count count--learn${counts.learning ? '' : ' is-empty'}`,
          text: String(counts.learning),
          title: 'Learning cards left',
        }),
        el('span', {
          class: `count count--due${counts.review ? '' : ' is-empty'}`,
          text: String(counts.review),
          title: 'Reviews left',
        }),
      ]),
      el('button', {
        class: 'icon-btn',
        type: 'button',
        'aria-label': 'Undo last answer',
        disabled: this.history.length === 0,
        onclick: () => this.undo(),
      }, [icon('undo')]),
    ]);
    return bar;
  }

  renderProgress() {
    const done = this.initialTotal - this.pending.length;
    const pct = this.initialTotal ? (done / this.initialTotal) * 100 : 0;
    return el('div', { class: 'progress' }, [
      el('div', { class: 'progress__fill', style: { width: `${Math.min(100, pct)}%` } }),
    ]);
  }

  /** Draw the top card plus a couple of static ghosts behind it. */
  renderStack() {
    const stack = this.pending.slice(0, GHOST_COUNT + 1).reverse();
    stack.forEach((card, i) => {
      const isTop = i === stack.length - 1;
      const depth = stack.length - 1 - i;
      const node = this.renderCard(card, isTop, depth);
      this.stage.appendChild(node);
      if (isTop) {
        this.cardEl = node;
        this.attachGestures(node);
      }
    });
  }

  renderCard(card, isTop, depth) {
    const node = el('div', {
      class: `flashcard ${isTop ? 'flashcard--top' : 'flashcard--ghost'}${this.revealed && isTop ? ' is-revealed' : ''}`,
      style: isTop
        ? {}
        : {
            transform: `translateY(${depth * 9}px) scale(${1 - depth * 0.035})`,
            opacity: String(1 - depth * 0.28),
          },
    });

    const content = el('div', { class: 'flashcard__content' });

    if (card.tag) content.appendChild(el('span', { class: 'flashcard__tag', text: card.tag }));
    content.appendChild(el('div', { class: 'flashcard__question', text: card.question }));

    if (isTop && this.revealed) {
      content.appendChild(el('div', { class: 'flashcard__divider' }));
      content.appendChild(el('div', { class: 'flashcard__answer', text: card.answer }));
      if (card.extra) {
        content.appendChild(el('div', { class: 'flashcard__extra', text: card.extra }));
      }
    }

    const scroll = el('div', { class: 'flashcard__scroll' }, [content]);
    node.appendChild(scroll);

    if (isTop) {
      if (!this.revealed) {
        node.appendChild(el('div', {
          class: 'flashcard__hint',
          text: this.settings.swipeBeforeReveal
            ? 'Tap to reveal · swipe to answer'
            : 'Tap to reveal',
        }));
      }
      // Swipe direction badges
      node.appendChild(el('div', { class: 'swipe-badge swipe-badge--again', text: 'Again' }));
      node.appendChild(el('div', { class: 'swipe-badge swipe-badge--good', text: 'Got it' }));
      node.appendChild(el('div', { class: 'swipe-badge swipe-badge--easy', text: 'Easy' }));
      if (this.settings.showHardButton) {
        node.appendChild(el('div', { class: 'swipe-badge swipe-badge--hard', text: 'Hard' }));
      }
      this.badges = {
        [Rating.Again]: node.querySelector('.swipe-badge--again'),
        [Rating.Good]: node.querySelector('.swipe-badge--good'),
        [Rating.Easy]: node.querySelector('.swipe-badge--easy'),
        [Rating.Hard]: node.querySelector('.swipe-badge--hard'),
      };
    }

    return node;
  }

  renderActionArea() {
    const showGrades = this.revealed || this.settings.swipeBeforeReveal;

    if (!showGrades) {
      this.root.appendChild(
        el('div', { class: 'reveal-bar' }, [
          el('button', {
            class: 'btn btn--primary',
            type: 'button',
            text: 'Show answer',
            onclick: () => this.reveal(),
          }),
        ])
      );
      return;
    }

    const previews = this.settings.showIntervalHints
      ? previewAll(this.current, this.settings, Date.now())
      : null;

    const ivl = (rating) =>
      previews ? el('span', { class: 'grade-btn__ivl', text: formatInterval(previews[rating].interval) }) : null;

    const actions = el('div', { class: 'study__actions' }, [
      el('button', {
        class: 'grade-btn grade-btn--again',
        type: 'button',
        'aria-label': 'Again — I did not know this',
        onclick: () => this.grade(Rating.Again),
      }, [icon('cross'), ivl(Rating.Again)]),

      this.settings.showHardButton
        ? el('button', {
            class: 'grade-btn grade-btn--hard',
            type: 'button',
            'aria-label': 'Hard — I knew it, barely',
            onclick: () => this.grade(Rating.Hard),
          }, [icon('half'), ivl(Rating.Hard)])
        : null,

      el('button', {
        class: 'grade-btn grade-btn--good',
        type: 'button',
        'aria-label': 'Good — I knew this',
        onclick: () => this.grade(Rating.Good),
      }, [icon('check'), ivl(Rating.Good)]),

      // Easy sits last so the intervals under the row increase left to right.
      el('button', {
        class: 'grade-btn grade-btn--easy',
        type: 'button',
        'aria-label': 'Easy — instant recall',
        onclick: () => this.grade(Rating.Easy),
      }, [icon('star'), ivl(Rating.Easy)]),
    ]);

    this.root.appendChild(actions);
  }

  reveal() {
    if (this.revealed) return;
    this.revealed = true;
    haptic(6, this.settings.hapticsEnabled);
    this.render();
  }

  /* ---------------------------------------------------------- gestures */

  attachGestures(node) {
    let startX = 0, startY = 0, dx = 0, dy = 0;
    let dragging = false, pointerId = null, moved = false;
    let startedAt = 0;

    const width = () => node.getBoundingClientRect().width || window.innerWidth;
    const commitDistance = () => width() * this.settings.swipeThreshold;

    const onDown = (e) => {
      if (this.animating) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = dy = 0;
      dragging = true;
      moved = false;
      startedAt = performance.now();
      node.classList.add('is-dragging');
      node.classList.remove('is-settling');
      node.setPointerCapture?.(pointerId);
    };

    const onMove = (e) => {
      if (!dragging || e.pointerId !== pointerId) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (!moved) return;

      const rotate = (dx / width()) * 15;
      node.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;

      this.updateBadges(dx, dy, commitDistance());
    };

    const onUp = (e) => {
      if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
      dragging = false;
      node.classList.remove('is-dragging');
      node.releasePointerCapture?.(pointerId);
      pointerId = null;

      const elapsed = performance.now() - startedAt;
      const velocityX = dx / Math.max(elapsed, 1);
      const velocityY = dy / Math.max(elapsed, 1);
      const threshold = commitDistance();

      // A tap, not a drag.
      if (!moved) {
        this.clearBadges();
        node.style.transform = '';
        if (!this.revealed) this.reveal();
        return;
      }

      const rating = this.ratingFromGesture(dx, dy, velocityX, velocityY, threshold);

      if (rating) {
        this.flingAndGrade(node, rating, dx, dy);
      } else {
        this.clearBadges();
        node.classList.add('is-settling');
        node.style.transform = '';
        setTimeout(() => node.classList.remove('is-settling'), 340);
      }
    };

    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  }

  /**
   * Decide which grade a released drag means. Horizontal wins ties because
   * left/right are the two gestures the user is told about.
   */
  ratingFromGesture(dx, dy, vx, vy, threshold) {
    const FLICK = 0.55; // px per ms
    const horizontal = Math.abs(dx) >= Math.abs(dy);

    if (horizontal) {
      if (dx > threshold || vx > FLICK) return Rating.Good;
      if (dx < -threshold || vx < -FLICK) return Rating.Again;
      return null;
    }
    if (dy < -threshold || vy < -FLICK) return Rating.Easy;
    if (this.settings.showHardButton && (dy > threshold || vy > FLICK)) return Rating.Hard;
    return null;
  }

  updateBadges(dx, dy, threshold) {
    if (!this.badges) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const show = (rating, amount) => {
      const badge = this.badges[rating];
      if (badge) badge.style.opacity = String(Math.min(1, Math.max(0, amount)));
    };
    for (const r of [Rating.Again, Rating.Good, Rating.Easy, Rating.Hard]) show(r, 0);

    if (horizontal) {
      if (dx > 0) show(Rating.Good, dx / threshold);
      else show(Rating.Again, -dx / threshold);
      this.setWash(dx > 0 ? 'good' : 'again', Math.min(1, Math.abs(dx) / threshold) * 0.85);
    } else {
      if (dy < 0) show(Rating.Easy, -dy / threshold);
      else if (this.settings.showHardButton) show(Rating.Hard, dy / threshold);
      this.setWash(null, 0);
    }
  }

  setWash(kind, amount) {
    if (!this.stage) return;
    this.stage.style.setProperty('--wash-again', kind === 'again' ? String(amount) : '0');
    this.stage.style.setProperty('--wash-good', kind === 'good' ? String(amount) : '0');
    this.stage.dataset.wash = kind || '';
  }

  clearBadges() {
    if (this.badges) {
      for (const badge of Object.values(this.badges)) {
        if (badge) badge.style.opacity = '0';
      }
    }
    this.setWash(null, 0);
  }

  /** Throw the card off-screen in the direction it was swiped, then grade it. */
  flingAndGrade(node, rating, dx, dy) {
    if (this.animating) return;
    this.animating = true;
    this.clearBadges();

    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const targetX = horizontal ? Math.sign(dx || 1) * (w * 1.3) : dx * 1.4;
    const targetY = horizontal ? dy * 1.2 : Math.sign(dy || -1) * (h * 1.1);
    const rotate = (targetX / w) * 22;

    node.classList.add('is-leaving');
    node.style.transform = `translate(${targetX}px, ${targetY}px) rotate(${rotate}deg)`;
    node.style.opacity = '0';

    setTimeout(() => {
      this.animating = false;
      this.grade(rating, { skipAnimation: true });
    }, 210);
  }

  /* ---------------------------------------------------------- grading */

  async grade(rating, { skipAnimation = false } = {}) {
    const card = this.current;
    if (!card || this.animating) return;

    // Grading from a button: play the same fling so the gesture and the
    // button feel like the same action.
    if (!skipAnimation && this.cardEl) {
      const dx = rating === Rating.Good ? 200 : rating === Rating.Again ? -200 : 0;
      const dy = rating === Rating.Easy ? -200 : rating === Rating.Hard ? 200 : 0;
      this.flingAndGrade(this.cardEl, rating, dx, dy);
      return;
    }

    haptic(rating === Rating.Again ? [12, 40, 12] : rating === Rating.Easy ? [8, 30, 18] : 10,
      this.settings.hapticsEnabled);

    const durationMs = Math.min(performance.now() - this.cardShownAt, 5 * 60 * 1000);
    const now = Date.now();
    const { card: updated, log } = applyReview(card, rating, this.settings, now, durationMs);

    this.history.push({ before: { ...card }, after: { ...updated }, rating, index: 0 });
    if (this.history.length > 30) this.history.shift();

    this.stats.reviewed++;
    this.stats[['', 'again', 'hard', 'good', 'easy'][rating]]++;

    // Requeue if it comes back within this sitting; otherwise it's done for today.
    this.pending.shift();
    const dueWithinSession = updated.due - now < 20 * 60 * 1000;
    if (dueWithinSession) {
      const insertAt = insertionPoint(this.pending, updated.due, now);
      this.pending.splice(insertAt, 0, updated);
    }

    this.revealed = this.settings.autoRevealAnswer;
    this.render();

    try {
      await commitReview(updated, log);
    } catch (err) {
      console.error(err);
      toast('Could not save that answer', 'error');
    }
  }

  async undo() {
    const last = this.history.pop();
    if (!last) return;
    haptic(8, this.settings.hapticsEnabled);

    // Pull the card out of wherever it was requeued, then restore its pre-review state.
    const idx = this.pending.findIndex((c) => c.id === last.before.id);
    if (idx >= 0) this.pending.splice(idx, 1);
    this.pending.unshift(last.before);

    this.stats.reviewed = Math.max(0, this.stats.reviewed - 1);
    const key = ['', 'again', 'hard', 'good', 'easy'][last.rating];
    this.stats[key] = Math.max(0, this.stats[key] - 1);

    this.revealed = true;
    this.render();

    try {
      const { put, getAll, del } = await import('../store.js');
      await put('cards', last.before);
      // Drop the log entry we just wrote for this card.
      const logs = await getAll('reviews', 'cardId', IDBKeyRange.only(last.before.id));
      const newest = logs.sort((a, b) => b.ts - a.ts)[0];
      if (newest) await del('reviews', newest.id);
    } catch (err) {
      console.error(err);
    }
    toast('Answer undone');
  }

  /* ---------------------------------------------------------- summary */

  renderSummary() {
    const { reviewed, again, hard, good, easy, startedAt } = this.stats;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const correct = hard + good + easy;
    const accuracy = reviewed ? correct / reviewed : null;

    const nothingToDo = reviewed === 0;

    return el('div', { class: 'view summary' }, [
      el('div', { class: 'summary__emoji', text: nothingToDo ? '☕' : '🎉' }),
      el('h2', {
        class: 'summary__title',
        text: nothingToDo ? 'Nothing due right now' : 'Session complete',
      }),
      el('p', {
        class: 'summary__sub',
        text: nothingToDo
          ? 'This deck is fully caught up. Come back when cards fall due, or add more.'
          : `${reviewed} card${reviewed === 1 ? '' : 's'} in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      }),

      !nothingToDo
        ? el('div', { class: 'stat-grid mb-4' }, [
            statTile(String(reviewed), 'Reviewed'),
            statTile(accuracy == null ? '—' : formatPercent(accuracy), 'Recalled'),
            statTile(String(easy), 'Easy'),
            statTile(String(again), 'Again'),
          ])
        : null,

      el('button', {
        class: 'btn btn--primary btn--block',
        type: 'button',
        text: 'Done',
        onclick: () => this.exit(),
      }),
    ]);
  }
}

/* ------------------------------------------------------------------ utils */

function statTile(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat__value', text: value }),
    el('div', { class: 'stat__label', text: label }),
  ]);
}

function countByState(cards) {
  const out = { new: 0, learning: 0, review: 0 };
  for (const c of cards) {
    if (c.state === State.New) out.new++;
    else if (c.state === State.Learning || c.state === State.Relearning) out.learning++;
    else out.review++;
  }
  return out;
}

/**
 * Spread new cards evenly through the due cards so the session doesn't start
 * with a wall of unknowns or end with one.
 */
function interleave(learning, review, fresh) {
  const backbone = [...learning, ...review];
  if (!fresh.length) return backbone;
  if (!backbone.length) return [...fresh];

  const out = [];
  const gap = backbone.length / fresh.length;
  let nextNew = 0;
  for (let i = 0; i < backbone.length; i++) {
    while (nextNew < fresh.length && i >= gap * nextNew) {
      out.push(fresh[nextNew++]);
    }
    out.push(backbone[i]);
  }
  while (nextNew < fresh.length) out.push(fresh[nextNew++]);
  return out;
}

/** Where to slot a card that's coming back later in this same session. */
function insertionPoint(pending, due, now) {
  // Never immediately next — at least a couple of cards of separation, so the
  // answer isn't still sitting in working memory.
  const minGap = Math.min(3, pending.length);
  for (let i = minGap; i < pending.length; i++) {
    const other = pending[i];
    const otherDue = other.state === State.New ? now + 10 * DAY : other.due;
    if (otherDue > due) return i;
  }
  return pending.length;
}

export { retrievability };
