from playwright.sync_api import Page, expect, sync_playwright
import os

def verify_password_toggle(page: Page):
    # 1. Go to register page
    page.goto("http://localhost:5173/register")

    # 2. Find password input and type something
    # Use exact=True to avoid matching "Show password" button
    password_input = page.get_by_label("Password", exact=True)
    password_input.fill("MySecretPass123")

    # 3. Check it is hidden
    expect(password_input).to_have_attribute("type", "password")

    # 4. Find the toggle button
    toggle_btn = page.get_by_label("Show password")

    # 5. Click to show
    toggle_btn.click()

    # 6. Check it is visible
    expect(password_input).to_have_attribute("type", "text")
    expect(page.get_by_label("Hide password")).to_be_visible()

    # 7. Screenshot
    os.makedirs("/home/jules/verification", exist_ok=True)
    page.screenshot(path="/home/jules/verification/password_toggle.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_password_toggle(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            os.makedirs("/home/jules/verification", exist_ok=True)
            page.screenshot(path="/home/jules/verification/failure.png")
        finally:
            browser.close()
