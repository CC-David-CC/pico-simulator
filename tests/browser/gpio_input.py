"""Exercise the packaged RP2040 worker in an isolated WebOS desktop."""
from time import monotonic
from playwright.sync_api import expect


def replay(page, evidence):
    wid = page.evaluate("desktopLab.surfaces.get('Desktop').launch('pico-simulator').id")
    board = page.locator(f'.window[data-window="{wid}"]')
    button = lambda name: board.get_by_role('button', name=name, exact=True)
    switch = board.get_by_label('GPIO 2 input high')
    label = board.locator('.pico-led-state')
    states = []
    expect(switch).to_be_disabled()
    with page.expect_worker(lambda worker: worker.url.endswith('/workers/pico.mjs')) as started:
        button('Run GPIO input').click()
    for high in (False, True, False, True, False):
        switch.set_checked(high)
        expect(label).to_have_text('Pico onboard LED (GPIO 25): ' + ('off' if high else 'on'))
        lit = board.locator('.pico-led').evaluate("led => led.classList.contains('is-lit')")
        assert lit == (not high)
        states.append({'gp2': int(high), 'gp25': int(lit)})
        if len(states) in (2, 3):
            board.locator('.pico-stage').screenshot(path=evidence / f'gp2-{int(high)}.png')
    button('Stop').click()
    deadline = monotonic() + 5
    while started.value in page.workers and monotonic() < deadline:
        page.wait_for_timeout(25)
    assert started.value not in page.workers, 'Stop must terminate the GPIO firmware worker'
    expect(board.locator('.pico-status')).to_have_text('GPIO input example stopped.')
    expect(switch).to_be_disabled()

    # The old timed firmware continues to drive its own GPIO25 transitions.
    history = label.evaluate_handle("""el => {
        const changes = [];
        new MutationObserver(() => changes.push(el.textContent)).observe(el, {childList: true});
        return changes;
    }""")
    with page.expect_worker(lambda worker: worker.url.endswith('/workers/pico.mjs')):
        button('Run Blink').click()
    page.wait_for_function("""changes => {
        const high = changes.findIndex(text => text.endsWith(': on'));
        return high >= 0 && changes.slice(high + 1).some(text => text.endsWith(': off'));
    }""", arg=history)
    expect(switch).to_be_disabled()
    button('Stop').click()
    expect(board.locator('.pico-status')).to_have_text('Blink stopped.')
    return {'gpio_input': states, 'blink': 'GPIO25 on then off', 'gpio_worker_closed': True}
