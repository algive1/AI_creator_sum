# Product

## Register

product

## Users

This project serves two groups: mini program users who create AI images, videos, comic/storyboard content, and operators who maintain models, templates, payments, announcements, memberships, and feature availability in the admin dashboard.

## Product Purpose

AI Creator is a WeChat mini program plus admin system for running an AI creation service. Success means users can quickly enter the right creation flow, understand blocked or maintenance states, and trust that points, membership, templates, and generated outputs behave predictably.

## Brand Personality

Clear, efficient, creative. The mini program can feel visually expressive around creation, while admin surfaces should stay practical and direct.

## Anti-references

Avoid hiding operational state behind decorative UI, surprising navigation, marketing-heavy admin screens, and controls that appear to save settings but are not read by the mini program.

## Design Principles

Keep operational controls close to the workflow they affect.

Prefer explicit user feedback over silently hiding unavailable features.

Preserve existing routes and configuration behavior unless there is a product reason to change them.

Use the simplest implementation that can be maintained by operators.

## Image Preview Layout Rule

Mini program image previews should follow the inspiration waterfall pattern: use a fixed available width for the image card, read the real image dimensions, then set `height = width / imageAspectRatio`. Keep images in `aspectFit` so content is complete. Do not use a fixed-height gray stage for image previews, because it creates side gutters on poster-like images. If the calculated preview height exceeds the visible area, allow the sheet or page to scroll instead of shrinking the width, cropping the image, or adding side padding.

## Accessibility & Inclusion

Use readable contrast, clear labels, predictable controls, and reduced-motion-safe interactions. Maintenance and error states should be text-readable and not depend on color alone.
