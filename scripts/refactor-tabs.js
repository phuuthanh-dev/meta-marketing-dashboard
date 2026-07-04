const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const newNav = `        <nav class="tabs">
          <button class="tab active" data-tab="facebook">&#x1F4D8; Facebook</button>
          <button class="tab" data-tab="instagram">&#x1F4F7; Instagram</button>
          <button class="tab" data-tab="ads">&#x1F4B0; Meta Ads</button>
          <button class="tab" data-tab="automation">&#x1F916; Automation</button>
        </nav>

        <!-- Facebook Main Tab -->
        <div class="tab-content active" id="facebook-tab">
          <nav class="sub-tabs">
            <button class="sub-tab active" data-subtab="overview">Overview</button>
            <button class="sub-tab" data-subtab="analytics">Analytics</button>
            <button class="sub-tab" data-subtab="posts">Posts</button>
            <button class="sub-tab" data-subtab="media">Media</button>
            <button class="sub-tab" data-subtab="comments">Comments</button>
            <button class="sub-tab" data-subtab="messages">Inbox</button>
            <button class="sub-tab" data-subtab="page-management">Settings</button>
          </nav>

          <!-- Overview Sub-Tab -->
          <div class="sub-tab-content active" id="overview-tab">`;

// Replace from nav.tabs to overview-tab
html = html.replace(/<nav class="tabs">[\s\S]*?<div class="tab-content active" id="overview-tab">/, newNav);

// Replace remaining FB tabs to sub-tab-content
const fbTabs = ['posts-tab', 'comments-tab', 'audience-tab', 'messages-tab', 'media-tab', 'page-management-tab', 'analytics-tab'];
fbTabs.forEach(id => {
  html = html.replace(`<div class="tab-content" id="${id}">`, `<div class="sub-tab-content" id="${id}">`);
});

// Close facebook-tab before Ads Tab
html = html.replace('        <!-- Ads Tab -->', '        </div> <!-- end facebook-tab -->\n\n        <!-- Ads Tab -->');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ HTML structure updated!');
