document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    
    // Set user data if available
    const userInfo = document.getElementById('user-info');
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        const name = user.first_name || user.username || 'Boss';
        userInfo.innerHTML = `
            <span style="font-weight: 500; margin-right: 10px">${name}</span>
            <span class="user-avatar">🧑‍💼</span>
        `;
    }

    // Add staggered animation index for agent cards
    const agentCards = document.querySelectorAll('.agent-card');
    agentCards.forEach((card, index) => {
        card.style.setProperty('--n', index);
    });

    // Notify Telegram that the app is ready
    tg.ready();
});
