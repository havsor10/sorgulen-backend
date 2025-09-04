import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header


def _create_smtp_server():
    """Create and return an SMTP client session based on environment variables.

    This helper reads SMTP configuration from environment variables:
    - SMTP_HOST: the hostname of the SMTP server
    - SMTP_PORT: port number, defaults to 587
    - SMTP_USER and SMTP_PASS: credentials for authentication
    - SMTP_SECURE: if "true" or port is 465, use SSL, otherwise startTLS

    It returns a tuple of (server, from_address). If configuration is missing
    the function returns (None, None) to indicate that emails should not be
    sent.
    """
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    if not host or not user or not password:
        # Missing SMTP configuration; return None so that emails will not be sent
        print("[email_utils] SMTP configuration incomplete; skipping email sending")
        return None, None
    # Determine whether to use SSL (port 465) or startTLS (port 587)
    use_ssl = os.environ.get("SMTP_SECURE", "").lower() == "true" or port == 465
    try:
        server = smtplib.SMTP_SSL(host, port) if use_ssl else smtplib.SMTP(host, port)
        server.ehlo()
        if not use_ssl:
            # Start TLS for secure connection on non-SSL ports
            server.starttls()
        server.login(user, password)
        return server, user
    except Exception as e:
        print(f"[email_utils] Failed to connect to SMTP server: {e}")
        return None, None


def _build_message(to_email: str, subject: str, html_body: str, text_body: str) -> MIMEMultipart:
    """Build a multipart email message from parameters.

    The function sets the From, To and Subject headers and attaches both
    plaintext and HTML parts to the message. The sender details are derived
    from SMTP_FROM or SMTP_USER and SMTP_FROM_NAME environment variables.
    """
    msg = MIMEMultipart("alternative")
    from_email = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USER"))
    from_name = os.environ.get("SMTP_FROM_NAME", "")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


def send_email(to_email: str, subject: str, html_body: str, text_body: str):
    """Send an email using SMTP.

    If SMTP credentials are missing or the server cannot be reached, the
    function logs an error and returns without raising.
    """
    server, _ = _create_smtp_server()
    if not server:
        print(f"[email_utils] Could not send email to {to_email}: SMTP server unavailable")
        return
    try:
        msg = _build_message(to_email, subject, html_body, text_body)
        server.sendmail(msg["From"], [to_email], msg.as_string())
    except Exception as e:
        print(f"[email_utils] Failed to send email to {to_email}: {e}")
    finally:
        try:
            server.quit()
        except Exception:
            pass


def send_customer_confirmation(order):
    """Send a confirmation email to the customer based on order data.

    The order should be an object or dict with at least the attributes
    `navn`, `epost`, and `tjeneste`. Additional optional attributes like
    `telefon`, `adresse`, `dato`, `tid` and `tilleggsinfo` will be included
    in the email body if present.
    """
    # Ensure there is a customer email
    to_email = getattr(order, "epost", None) or (order.get("epost") if isinstance(order, dict) else None)
    if not to_email:
        return
    subject = f"Ordrebekreftelse – ref {getattr(order, 'id', '') or (order.get('id') if isinstance(order, dict) else '')}"
    # Determine service name, handling both enum and string types
    service = getattr(order, "tjeneste", "") or (order.get("tjeneste") if isinstance(order, dict) else "")
    service_name = service.value if hasattr(service, "value") else service
    # Build a list of order details
    details = []
    details.append(f"Tjeneste: {service_name}")
    details.append(f"Navn: {getattr(order, 'navn', '-') or (order.get('navn') if isinstance(order, dict) else '-')}" )
    # Optionals
    phone = getattr(order, 'telefon', None) or (order.get('telefon') if isinstance(order, dict) else None)
    if phone:
        details.append(f"Telefon: {phone}")
    email = getattr(order, 'epost', None) or (order.get('epost') if isinstance(order, dict) else None)
    if email:
        details.append(f"E-post: {email}")
    address = getattr(order, 'adresse', None) or (order.get('adresse') if isinstance(order, dict) else None)
    if address:
        details.append(f"Adresse: {address}")
    date = getattr(order, 'dato', None) or (order.get('dato') if isinstance(order, dict) else None)
    if date:
        details.append(f"Dato: {date}")
    time = getattr(order, 'tid', None) or (order.get('tid') if isinstance(order, dict) else None)
    if time:
        details.append(f"Tid: {time}")
    extra = getattr(order, 'tilleggsinfo', None) or (order.get('tilleggsinfo') if isinstance(order, dict) else None)
    if extra:
        details.append(f"Tilleggsinfo: {extra}")
    # Build HTML and plain text bodies
    html_list_items = "".join([f"<li>{item}</li>" for item in details])
    html_body = f"""
        <div style="font-family:system-ui,Arial,sans-serif;max-width:600px">
            <h2>Ordrebekreftelse</h2>
            <p>Hei {getattr(order, 'navn', '') or (order.get('navn') if isinstance(order, dict) else '')},</p>
            <p>Vi har mottatt bestillingen din. Her er detaljene:</p>
            <ul>{html_list_items}</ul>
            <p>Vi tar kontakt for å bekrefte tid og pris.</p>
            <p>Med vennlig hilsen,<br>{os.environ.get('COMPANY_NAME', 'Sørgulen Industriservice')}</p>
        </div>
    """
    # Compose plain text body line by line
    text_lines = ["Ordrebekreftelse"]
    text_lines.extend(details)
    text_lines.append("\nVi tar kontakt for å bekrefte tid og pris.")
    text_body = "\n".join(text_lines)
    send_email(to_email, subject, html_body, text_body)


def send_admin_notification(order):
    """Send a notification email to the admin about the new order.

    The admin email address can be configured via MAIL_ADMIN_TO or ADMIN_EMAIL.
    """
    admin_email = os.environ.get("MAIL_ADMIN_TO") or os.environ.get("ADMIN_EMAIL")
    if not admin_email:
        print("[email_utils] ADMIN_EMAIL not configured; skipping admin notification")
        return
    subject = f"Ny bestilling – ref {getattr(order, 'id', '') or (order.get('id') if isinstance(order, dict) else '')}"
    service = getattr(order, "tjeneste", "") or (order.get("tjeneste") if isinstance(order, dict) else "")
    service_name = service.value if hasattr(service, "value") else service
    details = []
    details.append(f"Tjeneste: {service_name}")
    details.append(f"Navn: {getattr(order, 'navn', '-') or (order.get('navn') if isinstance(order, dict) else '-')}")
    phone = getattr(order, 'telefon', None) or (order.get('telefon') if isinstance(order, dict) else None)
    if phone:
        details.append(f"Telefon: {phone}")
    email = getattr(order, 'epost', None) or (order.get('epost') if isinstance(order, dict) else None)
    if email:
        details.append(f"E-post: {email}")
    address = getattr(order, 'adresse', None) or (order.get('adresse') if isinstance(order, dict) else None)
    if address:
        details.append(f"Adresse: {address}")
    date = getattr(order, 'dato', None) or (order.get('dato') if isinstance(order, dict) else None)
    if date:
        details.append(f"Dato: {date}")
    time = getattr(order, 'tid', None) or (order.get('tid') if isinstance(order, dict) else None)
    if time:
        details.append(f"Tid: {time}")
    extra = getattr(order, 'tilleggsinfo', None) or (order.get('tilleggsinfo') if isinstance(order, dict) else None)
    if extra:
        details.append(f"Tilleggsinfo: {extra}")
    html_list_items = "".join([f"<li>{item}</li>" for item in details])
    html_body = f"""
        <div style="font-family:system-ui,Arial,sans-serif;max-width:600px">
            <h2>Ny bestilling mottatt</h2>
            <ul>{html_list_items}</ul>
            <p>Logg inn i administrasjonspanelet for å se flere detaljer.</p>
        </div>
    """
    text_body = "\n".join(details)
    send_email(admin_email, subject, html_body, text_body)