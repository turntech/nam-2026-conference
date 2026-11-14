import { test, expect } from '@playwright/test';
import { API, visit, momentOn, conferenceDays, ATTENDEES, laneFor, shotForPR } from './helpers.js';


test.describe('Home is a way in, not a feed', () => {
  test('it links to every main page, and each link lands', async ({ page }) => {
    await visit(page, '/');
    const links = page.getByTestId('quick-links').getByRole('link');
    await expect(links).toHaveCount(5);

    for (const [name, path] of [['Schedule', '/schedule'], ['Speakers', '/speakers'], ['Venues', '/venues'],
      ['Food & drink', '/food'], ['Expo', '/expo']]) {
      await expect(page.getByTestId('quick-links').getByRole('link', { name: new RegExp(`^${name}`) }))
        .toHaveAttribute('href', path);
    }
  });

  test('nothing on it is personal or live', async ({ page }) => {
    // A speaker, mid-morning, with sessions booked: the case that used to fill the page.
    await visit(page, '/', { as: ATTENDEES.andy, at: await momentOn(0, '10:30') });
    await expect(page.getByTestId('quick-links')).toBeVisible();
    for (const id of ['today-panel', 'live-now', 'speaking-strip', 'followed-sessions', 'next-up']) {
      await expect(page.getByTestId(id), `${id} should not be on home`).toHaveCount(0);
    }
  });

  test('no announcement appears before it was posted', async ({ page, request }) => {
    const days = await conferenceDays();
    const all = await (await request.get(`${API}/announcements`)).json();
    const cutoff = `${days[0]}T09:00:00Z`;
    const posted = all.filter((a) => a.postedAt <= cutoff);
    const future = all.filter((a) => a.postedAt > cutoff);
    expect(posted.length, 'nothing is posted before 09:00 on day 1').toBeGreaterThan(0);
    expect(future.length, 'nothing is posted after 09:00 on day 1').toBeGreaterThan(0);

    await visit(page, '/', { at: await momentOn(0, '09:00') });
    const strip = page.getByTestId('announcements');
    await expect(strip).toBeVisible();

    const shown = await strip.innerText();
    for (const a of future) {
      expect(shown, `"${a.title}" was posted later than the clock`).not.toContain(a.title);
    }
  });
});

test.describe('My Agenda is a blank canvas', () => {
  test('it says it is coming soon, and is still in the nav', async ({ page }, testInfo) => {
    await visit(page, '/');
    // Desktop shows the main nav; a phone hides it behind the menu button.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: /My Agenda/ }).click();
    } else {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /My Agenda/ }).click();
    }
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-coming-soon')).toContainText('Coming soon');

    await visit(page, '/my-plan');
    await expect(page).toHaveURL(/\/my-agenda$/);
    await expect(page.getByTestId('agenda-coming-soon')).toBeVisible();
  });
});

test.describe('Interests box', () => {
  test('saves, survives reload, edits, clears, counts, and stays off My Agenda', async ({ page, request }, testInfo) => {
    const lane = await laneFor('home.interests', testInfo);
    const note = `${API}/users/${lane.user}/interest-note`;
    await request.put(note, { data: { text: '' } });

    await visit(page, '/', { as: lane.user });
    const input = page.getByTestId('interests-input');
    await expect(page.getByTestId('interests-box')).toBeVisible();
    await expect(page.getByTestId('interests-remaining')).toHaveText('500 left');

    await input.fill('Rust and rockets');
    await expect(page.getByTestId('interests-remaining')).toHaveText('484 left');
    await input.fill('x'.repeat(501));
    await expect(page.getByTestId('interests-remaining')).toHaveText('-1 left');
    await expect(page.getByTestId('interests-save')).toBeDisabled();

    await input.fill('uniqueinterestmarker one');
    await page.getByTestId('interests-save').click();
    await page.reload();
    await expect(input).toHaveValue('uniqueinterestmarker one');
    await shotForPR(page, 'Interests box on Home');

    await input.fill('uniqueinterestmarker two');
    await page.getByTestId('interests-save').click();
    await page.reload();
    await expect(input).toHaveValue('uniqueinterestmarker two');

    await page.goto('/my-agenda');
    await expect(page.getByRole('main')).not.toContainText('uniqueinterestmarker');
    await page.goto('/');
    await page.getByTestId('interests-clear').click();
    await page.reload();
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('interests-remaining')).toHaveText('500 left');
  });
});

test.describe('Ask the assistant', () => {
  test('ask the assistant and follow a result', async ({ page, request }, testInfo) => {
    const lane = await laneFor('home.ask', testInfo);
    const all = await (await request.get(`${API}/sessions`)).json();
    const sessions = Array.isArray(all) ? all : all.sessions;
    const [a, b] = sessions;
    const shape = (s) => ({ id: s.id, title: s.title, trackName: s.track.name, day: s.day, startsAt: s.startsAt });
    let mode = 'ok';
    await page.route('**/api/users/*/ask', (route) => route.fulfill({
      json: mode === 'ok' ? { available: true, sessions: [shape(a), shape(b)] } : { available: false },
    }));

    await visit(page, '/', { as: lane.user, at: await momentOn(0, '08:00') });
    await page.getByTestId('ask-input').fill('What should I see about cloud costs?');
    await page.getByTestId('ask-submit').click();
    await expect(page.getByTestId('ask-result')).toHaveCount(2);
    await shotForPR(page, 'Answer to a question on Home');

    // the rest of Home still works when the assistant is down
    mode = 'down';
    await page.getByTestId('ask-submit').click();
    await expect(page.getByTestId('ask-unavailable')).toHaveText('The assistant is not available right now');
    await expect(page.getByTestId('interests-box')).toBeVisible();
    await expect(page.getByTestId('quick-links')).toBeVisible();

    mode = 'ok';
    await page.getByTestId('ask-submit').click();
    await page.getByTestId('ask-result').first().click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${a.id}$`));
  });
});
