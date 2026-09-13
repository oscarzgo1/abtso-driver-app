export interface Testimonial {
  /** Real customer's name, as they want it shown. */
  name: string;
  /** Role + company, e.g. "Operations Manager, Acme Logistics". */
  title: string;
  /** Their real words, with their OK to publish it here. */
  quote: string;
  /** Optional. Path to their photo. Drop the image file into
   * admin_dashboard/public/testimonials/ and reference it here as
   * '/testimonials/filename.jpg' — or paste a hosted image URL directly.
   * Leave unset and the card shows an initial-letter avatar instead. */
  photo?: string;
}

/** Real customers only — each entry needs their permission to publish
 * their name, photo, and quote on the login page. Empty by default so
 * the login screen ships safely with nothing shown until real entries
 * are added; CustomerTestimonial (src/components/ui/customer-testimonial.tsx)
 * renders nothing when this array is empty.
 *
 * Add an entry like:
 * { name: 'Jane Doe', title: 'Operations Manager, Acme Logistics',
 *   quote: 'Real quote here.', photo: '/testimonials/jane.jpg' },
 */
export const testimonials: Testimonial[] = [];
