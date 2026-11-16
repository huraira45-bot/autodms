# Vehicle History printing

Workshop > Vehicle History has a Print history button after a successful vehicle search. It uses the browser print dialog (including Save as PDF).

The print includes the company header, applied vehicle search identifiers, summary totals, and every loaded job card with labour, sublet and parts details. Collapsed cards are included without changing their screen state. Empty work sections and screen controls are hidden in print. Existing search scope and permissions remain unchanged.

Validation: frontend production build passed. A headless Chrome PDF check used three collapsed job cards, including a legacy card, with labour, sublet and 62 parts rows. All identifiers and rows appeared across two pages; controls were excluded and text remained within page bounds. The first page was visually inspected.

Deployment: pull the update, rebuild Software/frontend, and restart the existing PM2 application. No database migration is required.
