# AI Creator Product Notes

AI Creator is a mobile-first AI creation product with a WeChat mini program, a Node.js API server, and an Ant Design management console.

The mini program focuses on AI image, video, comic-style video creation, points purchase, membership purchase, inspiration templates, and user profile workflows. The visual direction is premium mobile utility: purple and pink gradients, white rounded surfaces, soft shadows, clear pricing cards, and restrained motion.

The admin console is an operational tool for configuring models, feature tiers, membership plans, point packages, templates, payments, storage, and WeChat settings. It should stay clear, dense, and reliable rather than marketing-oriented.

Current implementation should preserve real backend configuration as the source of truth. Development fallbacks may help preview empty states, but production should not display fake prices, fake benefits, or fake package data.
