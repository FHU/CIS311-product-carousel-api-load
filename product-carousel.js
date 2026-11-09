/* ---------- Configuration ---------- */
// The REST endpoint returns an array of product objects shaped like
// naturally_a_deal_products.json. Swap in your real API URL here.
// A relative path also works when this page and the JSON file are
// served from the same local server (e.g. `python3 -m http.server`).
const API_URL = 'naturally_a_deal_products.json';

// Which categories get a shelf, in display order, and how many cards each shows.
const SHELF_CATEGORIES = ['Snacks', 'Bakery', 'Dairy', 'Beverage', 'Canned Goods'];
const ITEMS_PER_SHELF  = 20;

// Fake network delay in milliseconds, so the loading message is visible when
// the JSON file is served locally. Set to 0 to turn it off.
const SIMULATED_DELAY_MS = 1500;

const shelvesEl = document.querySelector('#shelves');
const statusEl  = document.querySelector('#status');
const shelfTemplate  = document.querySelector('#shelf-template');
const cardTemplate   = document.querySelector('#card-template');

/* ---------- Fetching ---------- */
async function fetchProducts() {
  // Simulated delay: a Promise that resolves after SIMULATED_DELAY_MS.
  // await pauses this function until the timer finishes. Remove for real use.
  await new Promise(resolve => setTimeout(resolve, SIMULATED_DELAY_MS));

  // Ask for JSON. A static file ignores this, but many APIs use it to pick
  // the response format.
  const res = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`The server responded ${res.status} ${res.statusText}.`);

  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('The response was not a list of products.');
  
  // Clean up each product, keeping only ones with a name and a valid price.
  const products = [];
  for (const raw of data) {
    const product = normalize(raw);
    if (product.product_name && Number.isFinite(product.price)) {
      products.push(product);
    }
  }
  return products;

  // The same thing as a one-liner using map() and filter():
  //   map(normalize) runs normalize on every item and returns a new array.
  //   filter(...) keeps only the items where the callback returns true.
  // return data.map(normalize).filter(product => product.product_name && Number.isFinite(product.price));
}

// The API sends every value as a string ("price": "22.87"), so turn the
// price into a number and trim the text fields we match or display.
function normalize(raw) {
  return {
    ...raw,
    product_name: raw.product_name?.trim(),
    categories: raw.categories?.trim(),
    price: Number.parseFloat(raw.price),
  };
}

/* ---------- Building cards and shelves ---------- */
// innerHTML is used here (instead of textContent) so the cents can be wrapped
// in a <sup> tag. That's safe because the string is built from a number we
// formatted ourselves. Never use innerHTML with text that came from the API
// or a user: it would run any HTML or script inside it.
function formatPrice(price) {
  const [dollars, cents] = price.toFixed(2).split('.');
  return `$${dollars}<sup>${cents}</sup>`;
}

function dateText(product) {
  if (product.best_by_date) return `Best by ${product.best_by_date}`;
  const label = product.date_label ?? '';
  // The source data uses these placeholder values to mean "no date".
  // This is a cleanup for this particular dataset, not a JavaScript idiom.
  return ['', '-', '- -', '0'].includes(label) ? '' : label;
}

function makeCard(product) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  // Becomes data-product-id="..." on the <li>, so code like an "Add to cart"
  // handler can tell which product a card belongs to.
  card.dataset.productId = product.product_id;

  const media = card.querySelector('.media');
  const img = card.querySelector('img');
  media.dataset.initial = product.product_name.charAt(0);
  img.addEventListener('error', () => media.classList.add('no-img'));
  if (product.image_url) {
    img.src = product.image_url;
    img.alt = product.product_name;
  } else {
    media.classList.add('no-img');
  }

  const storage = card.querySelector('.storage');
  storage.textContent = product.storage_type;
  storage.dataset.type = product.storage_type;
  storage.hidden = !product.storage_type;

  const pack = card.querySelector('.pack');
  pack.textContent = product.package_size ? `Case · ${product.package_size}` : '';
  pack.hidden = !product.package_size;

  const name = card.querySelector('.name a');
  name.href = product.source_url;
  name.textContent = product.product_name;

  card.querySelector('.amount').innerHTML = formatPrice(product.price);
  card.querySelector('.unit').textContent = product.unit_price ? `($${product.unit_price})` : '';

  const date = card.querySelector('.date');
  date.textContent = dateText(product);
  date.hidden = !date.textContent;

  card.querySelector('.add').setAttribute('aria-label', `Add ${product.product_name} to cart`);
  return card;
}

function makeShelf(category, cards, countText) {
  const shelf = shelfTemplate.content.firstElementChild.cloneNode(true);
  shelf.setAttribute('aria-label', category);
  shelf.querySelector('h2').textContent = category;
  shelf.querySelector('.count').textContent = countText;
  const track = shelf.querySelector('.track');
  track.setAttribute('aria-label', `${category} products`);
  track.append(...cards);
  return shelf;
}

/* ---------- Loading and error states ---------- */
function showLoading() {
  statusEl.hidden = true;
  const message = document.createElement('p');
  message.className = 'loading';
  message.textContent = 'Loading products…';
  shelvesEl.replaceChildren(message);
}

function showError(error) {
  shelvesEl.replaceChildren();
  statusEl.querySelector('.status-detail').textContent = error.message;
  statusEl.hidden = false;
}

/* ---------- Carousel behavior ---------- */
// Show or hide the arrows and edge fades depending on the scroll position.
function updateCarousel(carousel) {
  const track = carousel.querySelector('.track');   // the scrolling row of cards

  // scrollLeft:  how far the track has been scrolled, in pixels (0 = far left)
  // clientWidth: how wide the visible part of the track is
  // scrollWidth: how wide all the cards are together, including hidden ones
  // The 1px allowance covers browsers that report fractional pixels.
  const atStart = track.scrollLeft <= 1;
  const atEnd   = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;

  // A disabled button can't be clicked; the CSS also fades it out.
  carousel.querySelector('.prev').disabled = atStart;
  carousel.querySelector('.next').disabled = atEnd;

  // toggle(name, true) adds the class and toggle(name, false) removes it.
  // The CSS uses these classes to hide the edge fade on that side.
  carousel.classList.toggle('at-start', atStart);
  carousel.classList.toggle('at-end', atEnd);
}

// Set up one carousel: wire up its buttons and keep the arrows up to date.
function initCarousel(carousel) {
  const track = carousel.querySelector('.track');

  // Scroll by 90% of the visible width, so one card from the old view stays
  // in sight. dir is -1 for left (back) or 1 for right (forward).
  const page = dir => track.scrollBy({ left: dir * track.clientWidth * 0.9 });

  // Arrow functions wrap page() so it runs on click, not right away.
  carousel.querySelector('.prev').addEventListener('click', () => page(-1));
  carousel.querySelector('.next').addEventListener('click', () => page(1));

  // Re-check the arrows every time the track scrolls (by button, mouse,
  // trackpad, or keyboard). passive: true tells the browser we won't
  // block scrolling, so it can keep scrolling smooth.
  track.addEventListener('scroll', () => updateCarousel(carousel), { passive: true });

  // Run once now so the arrows are correct before any scrolling happens.
  updateCarousel(carousel);
}

// One resize listener for the whole page. It looks up whichever carousels
// are on the page right now, so reloading the shelves doesn't add more.
window.addEventListener('resize', () => {
  document.querySelectorAll('.carousel').forEach(updateCarousel);
});

/* ---------- Putting it together ---------- */
// Fetch the products, build one shelf per category, and put them on the page.
// Any failure along the way (network, bad response, no matching products)
// ends up in the catch block and shows the error message instead.
async function loadShelves() {
  // Replace whatever is on the page with a loading message while we wait.
  showLoading();
  try {
    // await pauses here until the request finishes. If fetchProducts throws,
    // execution jumps straight to catch.
    const products = await fetchProducts();

    // Build the shelves in the order listed in SHELF_CATEGORIES.
    const shelves = [];
    for (const category of SHELF_CATEGORIES) {
      const items = products.filter(product => product.categories === category);
      if (items.length === 0) continue;   // skip categories with no products

      // Limit each shelf to ITEMS_PER_SHELF cards, and say so in the count
      // label when some are left out (e.g. "20 of 57 items").
      const itemsShown = items.slice(0, ITEMS_PER_SHELF);
      const count = items.length > itemsShown.length
        ? `${itemsShown.length} of ${items.length} items`
        : `${items.length} items`;

      // Turn each product into a card element, then wrap the cards in a shelf.
      const cards = [];
      for (const product of itemsShown) {
        cards.push(makeCard(product));
      }
      shelves.push(makeShelf(category, cards, count));

      // The same thing using map(), which calls makeCard on every item and
      // returns the new array of cards:
      // shelves.push(makeShelf(category, itemsShown.map(makeCard), count));
    }

    // Throwing our own error reuses the same error display as a failed fetch.
    if (!shelves.length) throw new Error('No products were found in these categories.');

    // Swap the loading message for the finished shelves in one step, then
    // wire up the arrow buttons. Carousels must be on the page before
    // initCarousel runs, because it measures their scroll width.
    shelvesEl.replaceChildren(...shelves);
    shelvesEl.querySelectorAll('.carousel').forEach(initCarousel);
  } catch (error) {
    console.error(error);   // full details for the developer in DevTools
    showError(error);       // a readable message for the visitor
  }
}

// The "Try again" button just runs the whole process again.
statusEl.querySelector('.retry').addEventListener('click', loadShelves);

// Start loading as soon as the script runs.
loadShelves();
