<!--
  DRAFT — NOT YET REVIEWED BY A SOLICITOR. This addendum is drafted to
  cover the mandatory content required by UK GDPR Article 28(3) for a
  controller-processor contract. Article 28 compliance is not optional
  once a Customer has real drivers' personal data in the system — this
  is one of the most important documents in this set to get checked
  before real (non-trial) customer data is processed at scale.
-->

# Tachyo — Data Processing Addendum

**Last updated: [INSERT DATE ON PUBLICATION]**

This Data Processing Addendum ("**DPA**") forms part of the Terms of Service between Tachyo and the Customer, and applies whenever Tachyo processes personal data on the Customer's behalf as a processor — principally, data about the Customer's drivers.

## 1. Roles

For personal data about the Customer's drivers, shifts, and pay: the **Customer is the controller**, and **Tachyo is the processor**. The Customer determines the purposes and means of processing (e.g. deciding to track driver location, and why); Tachyo processes that data only as instructed.

## 2. Subject matter and duration

- **Subject matter**: provision of the Tachyo Services as described in the Terms.
- **Duration**: for the life of the Customer's account, and for the post-termination retention/deletion period described in Section 4 below.
- **Nature and purpose**: dispatch, timekeeping, payroll calculation support, safety alerting, and related fleet-management functions.
- **Categories of data subject**: the Customer's drivers (and other staff added to the platform, e.g. logistics/mechanic profiles).
- **Categories of personal data**: identity data, location/GPS data, shift and timekeeping data, pay/rate data — see the Privacy Policy, Section B2, for the full list.

## 3. Tachyo's obligations as processor

Tachyo shall:

3.1. Process personal data only on the Customer's documented instructions (which include those given through the Customer's own configuration of the Services, e.g. enabling GPS tracking or setting alert thresholds), unless required to do otherwise by UK law — in which case Tachyo will inform the Customer of that legal requirement first, unless prohibited from doing so.

3.2. Ensure that anyone authorised to process the data (including Tachyo's own staff) is subject to a duty of confidentiality.

3.3. Implement appropriate technical and organisational security measures, including those described in the Privacy Policy, Section B4 (hashed credentials, row-level data isolation, MFA availability).

3.4. Not engage a sub-processor without giving the Customer prior notice of the intended change, and giving the Customer the opportunity to object. Current sub-processors are listed in Section 6.

3.5. Assist the Customer, insofar as reasonably possible, in responding to requests from data subjects to exercise their rights under UK GDPR (access, rectification, erasure, restriction, objection, portability).

3.6. Assist the Customer in complying with its obligations around data security, breach notification, and (where applicable) data protection impact assessments, taking into account the nature of processing and information available to Tachyo.

3.7. Notify the Customer without undue delay after becoming aware of a personal data breach affecting the Customer's data.

3.8. At the Customer's choice, delete or return all personal data to the Customer at the end of the provision of Services, and delete existing copies, except to the extent UK law requires Tachyo to retain it. In practice, this is implemented through the trial-expiry deletion process described in Section 4.

3.9. Make available to the Customer all information reasonably necessary to demonstrate compliance with this DPA, and allow for and contribute to audits, including inspections, conducted by the Customer or an auditor mandated by the Customer, on reasonable notice.

## 4. Retention and deletion on account closure

4.1. While a Customer's account is on the free trial, driver GPS/location and shift history is retained for 12 months from collection (see Privacy Policy, Section B3), for the payroll-dispute and reporting reasons stated there.

4.2. If a Customer's trial period ends without conversion to a paid plan, the account is automatically suspended (blocking further access) at trial expiry, and — unless the Customer converts to a paid plan in the meantime — all of that Customer's driver, shift, rate, and location data, together with associated login accounts, is permanently deleted 30 days after suspension. This is an automated process; the Customer's own organisation record is retained afterward only as an inactive marker (no operational or personal data), primarily so the same company name/slug cannot be silently re-registered by someone else.

4.3. **[INSERT: the deletion/return process you intend to offer a Customer who terminates a PAID account outside the trial-expiry flow — the trial-expiry automation above does not currently apply to converted/paid accounts, so a separate manual or automated process is needed for that case before paid plans launch.]**

## 5. International transfers

Personal data is hosted and processed in the UK (Supabase, EU West / London region). **[If a sub-processor or hosting location outside the UK is introduced, this section must be updated with the relevant UK GDPR transfer safeguard — e.g. the UK's International Data Transfer Addendum — before that transfer happens.]**

## 6. Current sub-processors

| Sub-processor | Purpose | Location |
|---|---|---|
| Supabase | Database, authentication, hosting | EU West (London, UK) |
| Vercel | Web application hosting | [INSERT: confirm hosting region/edge configuration] |
| [INSERT: email delivery provider] | Transactional email | [INSERT] |

## 7. Liability

Liability under this DPA is subject to the limitations set out in the Terms of Service, Section 8.
