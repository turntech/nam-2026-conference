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
